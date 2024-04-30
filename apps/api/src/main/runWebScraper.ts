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
    crawlerOptions: job.data.crawlerOptions,
    pageOptions: job.data.pageOptions,
    inProgress: (progress) => {
      job.progress(progress);
    },
    onSuccess: (result) => {
      job.moveToCompleted(result);
    },
    onError: (error) => {
      job.moveToFailed(error);
    },
    team_id: job.data.team_id,
  })) as { success: boolean; message: string; docs: Document[] };
}
export async function runWebScraper({
  url,
  mode,
  crawlerOptions,
  pageOptions,
  inProgress,
  onSuccess,
  onError,
  team_id,
}: {
  url: string;
  mode: "crawl" | "single_urls" | "sitemap";
  crawlerOptions: any;
  pageOptions?: any;
  inProgress: (progress: any) => void;
  onSuccess: (result: any) => void;
  onError: (error: any) => void;
  team_id: string;
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
    const docs = (await provider.getDocuments(false, (progress: Progress) => {
      inProgress(progress);
    })) as Document[];

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
