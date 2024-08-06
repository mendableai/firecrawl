import { Job } from "bullmq";
import {
  CrawlResult,
  WebScraperOptions,
  RunWebScraperParams,
  RunWebScraperResult,
} from "../types";
import { WebScraperDataProvider } from "../scraper/WebScraper";
import { DocumentUrl, Progress } from "../lib/entities";
import { billTeam } from "../services/billing/credit_billing";
import { Document } from "../lib/entities";
import { supabase_service } from "../services/supabase";
import { Logger } from "../lib/logger";
import { ScrapeEvents } from "../lib/scrape-events";
import { getWebScraperQueue } from "../services/queue-service";

export async function startWebScraperPipeline({
  job,
  token,
}: {
  job: Job<WebScraperOptions>;
  token: string;
}) {
  let partialDocs: Document[] = [];
  return (await runWebScraper({
    url: job.data.url,
    mode: job.data.mode,
    crawlerOptions: job.data.crawlerOptions,
    extractorOptions: job.data.extractorOptions,
    pageOptions: job.data.pageOptions,
    inProgress: (progress) => {
      Logger.debug(`🐂 Job in progress ${job.id}`);
      if (progress.currentDocument) {
        partialDocs.push(progress.currentDocument);
        if (partialDocs.length > 50) {
          partialDocs = partialDocs.slice(-50);
        }
        job.updateProgress({ ...progress, partialDocs: partialDocs });
      }
    },
    onSuccess: (result, mode) => {
      Logger.debug(`🐂 Job completed ${job.id}`);
      saveJob(job, result, token, mode);
    },
    onError: (error) => {
      Logger.error(`🐂 Job failed ${job.id}`);
      ScrapeEvents.logJobEvent(job, "failed");
      job.moveToFailed(error, token, false);
    },
    team_id: job.data.team_id,
    bull_job_id: job.id.toString(),
  })) as { success: boolean; message: string; docs: Document[] };
}
export async function runWebScraper({
  url,
  mode,
  crawlerOptions,
  pageOptions,
  extractorOptions,
  inProgress,
  onSuccess,
  onError,
  team_id,
  bull_job_id,
}: RunWebScraperParams): Promise<RunWebScraperResult> {
  try {
    const provider = new WebScraperDataProvider();
    if (mode === "crawl") {
      await provider.setOptions({
        jobId: bull_job_id,
        mode: mode,
        urls: [url],
        extractorOptions,
        crawlerOptions: crawlerOptions,
        pageOptions: pageOptions,
        bullJobId: bull_job_id,
      });
    } else {
      await provider.setOptions({
        jobId: bull_job_id,
        mode: mode,
        urls: url.split(","),
        extractorOptions,
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
        docs: [],
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
    
    const isCancelled = await (await getWebScraperQueue().client).exists("cancelled:" + bull_job_id);

    if (!isCancelled) {
      const billingResult = await billTeam(team_id, filteredDocs.length);

      if (!billingResult.success) {
        // throw new Error("Failed to bill team, no subscription was found");
        return {
          success: false,
          message: "Failed to bill team, no subscription was found",
          docs: [],
        };
      }
    }

    // This is where the returnvalue from the job is set
    onSuccess(filteredDocs, mode);

    // this return doesn't matter too much for the job completion result
    return { success: true, message: "", docs: filteredDocs };
  } catch (error) {
    onError(error);
    return { success: false, message: error.message, docs: [] };
  }
}

const saveJob = async (job: Job, result: any, token: string, mode: string) => {
  try {
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      const { data, error } = await supabase_service
        .from("firecrawl_jobs")
        .update({ docs: result })
        .eq("job_id", job.id);

      if (error) throw new Error(error.message);
      try {
        if (mode === "crawl") {
          await job.moveToCompleted(null, token, false);
        } else {
          await job.moveToCompleted(result, token, false);
        }
      } catch (error) {
        // I think the job won't exist here anymore
      }
    } else {
      try {
        await job.moveToCompleted(result, token, false);
      } catch (error) {
        // I think the job won't exist here anymore
      }
    }
    ScrapeEvents.logJobEvent(job, "completed");
  } catch (error) {
    Logger.error(`🐂 Failed to update job status: ${error}`);
  }
};
