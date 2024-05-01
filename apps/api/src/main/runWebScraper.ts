import { Job } from "bull";
import { CrawlResult, WebScraperOptions } from "../types";
import { WebScraperDataProvider } from "../scraper/WebScraper";
import { DocumentUrl, Progress } from "../lib/entities";
import { billTeam } from "../services/billing/credit_billing";
import { Document } from "../lib/entities";

export async function startWebScraperPipeline({
  job,
}: {
  job: Job<WebScraperOptions>;
}) {
  return (await runWebScraper({
    url: job.data.url,
    mode: job.data.mode,
    start: new Date(),
    crawlerOptions: job.data.crawlerOptions,
    pageOptions: job.data.pageOptions,
    inProgress: (progress) => {
      if (!job.isCompleted() && !job.isFailed()) {
        job.progress(progress);
      }
    },
    onSuccess: (result) => {
      if (!job.isCompleted() && !job.isFailed()) {
        job.moveToCompleted(result);
      }
    },
    onError: (error) => {
      if (!job.isCompleted() && !job.isFailed()) {
        job.moveToFailed(error);
      }
    },
    team_id: job.data.team_id,
    timeout: job.data.timeout,
  })) as { success: boolean; message: string; docs: Document[] };
}
export async function runWebScraper({
  url,
  mode,
  start,
  crawlerOptions,
  pageOptions,
  inProgress,
  onSuccess,
  onError,
  team_id,
  timeout,
}: {
  url: string;
  mode: "crawl" | "single_urls" | "sitemap";
  start: Date,
  crawlerOptions: any;
  pageOptions?: any;
  inProgress: (progress: any) => void;
  onSuccess: (result: any) => void;
  onError: (error: any) => void;
  team_id: string;
  timeout?: number;
}): Promise<{
  success: boolean;
  message: string;
  docs: Document[] | DocumentUrl[];
}> {
  try {
    const provider = new WebScraperDataProvider();
    if (mode === "crawl") {
      await provider.setOptions({
        mode: mode,
        urls: [url],
        crawlerOptions: crawlerOptions,
        pageOptions: pageOptions,
      });
    } else {
      await provider.setOptions({
        mode: mode,
        urls: url.split(","),
        crawlerOptions: crawlerOptions,
        pageOptions: pageOptions,
      });
    }

    let docs: Document[] = [];

    try {
      // for some reason it keeps running even after the timeout...
      // progress.partialDocs.length keeps getting bigger
      const timeoutTime = timeout ? start.getTime() + timeout : undefined;
      console.log({timeoutTime, timeout, start: start.getTime()})
      docs = await provider.getDocuments(false, timeoutTime, (progress: Progress) => {
        inProgress(progress);
        if (timeout && new Date().getTime() > timeoutTime) {
          console.log('Timeout exceeded, returning partial results.');
          console.log('>', progress.partialDocs.length);
          onSuccess(progress.partialDocs);
          // throw new Error("Timeout exceeded");
          return { success: false, message: "Timeout exceeded", docs: progress.partialDocs }
        } // else {
        //   inProgress(progress);
        // }
      }) as Document[];
    } catch (error) {
      console.error("Error getting documents", error);
      return { success: false, message: error.message, docs: [] };
    }

    console.log('docs.length:', docs.length);

    if (docs.length === 0) {
      return {
        success: true,
        message: "No pages found",
        docs: []
      };
    }

    // remove docs with empty content
    const filteredDocs = crawlerOptions.returnOnlyUrls
      ? docs.map((doc) => {
          if (doc.metadata.sourceURL) {
            return { url: doc.metadata.sourceURL };
          }
        })
      : docs.filter((doc) => doc.content.trim().length > 0);


    const billingResult = await billTeam(
      team_id,
      filteredDocs.length
    );

    if (!billingResult.success) {
      // throw new Error("Failed to bill team, no subscription was found");
      return {
        success: false,
        message: "Failed to bill team, no subscription was found",
        docs: []
      };
    }

    // This is where the returnvalue from the job is set
    onSuccess(filteredDocs);

    // this return doesn't matter too much for the job completion result
    return { success: true, message: "", docs: filteredDocs };
  } catch (error) {
    console.error("Error running web scraper", error);
    onError(error);
    return { success: false, message: error.message, docs: [] };
  }
}
