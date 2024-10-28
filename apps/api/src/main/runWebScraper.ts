import { Job } from "bullmq";
import {
  WebScraperOptions,
  RunWebScraperParams,
  RunWebScraperResult,
} from "../types";
import { billTeam } from "../services/billing/credit_billing";
import { Document } from "../controllers/v1/types";
import { supabase_service } from "../services/supabase";
import { logger } from "../lib/logger";
import { ScrapeEvents } from "../lib/scrape-events";
import { configDotenv } from "dotenv";
import { scrapeURL, ScrapeUrlResponse } from "../scraper/scrapeURL";
configDotenv();

export async function startWebScraperPipeline({
  job,
  token,
}: {
  job: Job<WebScraperOptions> & { id: string };
  token: string;
}) {
  return (await runWebScraper({
    url: job.data.url,
    mode: job.data.mode,
    scrapeOptions: {
      ...job.data.scrapeOptions,
      ...(job.data.crawl_id ? ({
        formats: job.data.scrapeOptions.formats.concat(["rawHtml"]),
      }): {}),
    },
    internalOptions: job.data.internalOptions,
    // onSuccess: (result, mode) => {
    //   logger.debug(`🐂 Job completed ${job.id}`);
    //   saveJob(job, result, token, mode);
    // },
    // onError: (error) => {
    //   logger.error(`🐂 Job failed ${job.id}`);
    //   ScrapeEvents.logJobEvent(job, "failed");
    // },
    team_id: job.data.team_id,
    bull_job_id: job.id.toString(),
    priority: job.opts.priority,
    is_scrape: job.data.is_scrape ?? false,
  }));
}

export async function runWebScraper({
  url,
  mode,
  scrapeOptions,
  internalOptions,
  // onSuccess,
  // onError,
  team_id,
  bull_job_id,
  priority,
  is_scrape=false,
}: RunWebScraperParams): Promise<ScrapeUrlResponse> {
  let response: ScrapeUrlResponse | undefined = undefined;
  try {
    response = await scrapeURL(bull_job_id, url, scrapeOptions, { priority, ...internalOptions });
    if (!response.success) {
      if (response.error instanceof Error) {
        throw response.error;
      } else {
        throw new Error("scrapeURL error: " + (Array.isArray(response.error) ? JSON.stringify(response.error) : typeof response.error === "object" ? JSON.stringify({ ...response.error }) : response.error));
      }
    }

    if(is_scrape === false) {
      billTeam(team_id, undefined, 1).catch(error => {
        logger.error(`Failed to bill team ${team_id} for 1 credits: ${error}`);
        // Optionally, you could notify an admin or add to a retry queue here
      });
    }

    // This is where the returnvalue from the job is set
    // onSuccess(response.document, mode);

    return response;
  } catch (error) {
    if (response !== undefined) {
      return {
        ...response,
        success: false,
        error,
      }
    } else {
      return { success: false, error, logs: ["no logs -- error coming from runWebScraper"] };
    }
    // onError(error);
  }
}

const saveJob = async (job: Job, result: any, token: string, mode: string) => {
  try {
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
    if (useDbAuthentication) {
      const { data, error } = await supabase_service
        .from("firecrawl_jobs")
        .update({ docs: result })
        .eq("job_id", job.id);

      if (error) throw new Error(error.message);
      // try {
      //   if (mode === "crawl") {
      //     await job.moveToCompleted(null, token, false);
      //   } else {
      //     await job.moveToCompleted(result, token, false);
      //   }
      // } catch (error) {
      //   // I think the job won't exist here anymore
      // }
    // } else {
    //   try {
    //     await job.moveToCompleted(result, token, false);
    //   } catch (error) {
    //     // I think the job won't exist here anymore
    //   }
    }
    ScrapeEvents.logJobEvent(job, "completed");
  } catch (error) {
    logger.error(`🐂 Failed to update job status: ${error}`);
  }
};
