import { Job } from "bull";
import { CrawlResult, WebScraperOptions } from "../types";
import { WebScraperDataProvider } from "../scraper/WebScraper";
import { Progress } from "../lib/entities";
import { billTeam } from "../services/billing/credit_billing";

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
  })) as { success: boolean; message: string; docs: CrawlResult[] };
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
}): Promise<{ success: boolean; message: string; docs: CrawlResult[] }> {
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
    })) as CrawlResult[];

    if (docs.length === 0) {
      return {
        success: true,
        message: "No pages found",
        docs: [],
      };
    }

    // remove docs with empty content
    const filteredDocs = docs.filter((doc) => doc.content.trim().length > 0);
    onSuccess(filteredDocs);

    const { success, credit_usage } = await billTeam(
      team_id,
      filteredDocs.length
    );
    if (!success) {
      // throw new Error("Failed to bill team, no subscription was found");
      return {
        success: false,
        message: "Failed to bill team, no subscription was found",
        docs: [],
      };
    }

    return { success: true, message: "", docs: filteredDocs as CrawlResult[] };
  } catch (error) {
    console.error("Error running web scraper", error);
    onError(error);
    return { success: false, message: error.message, docs: [] };
  }
}
