import { Job } from "bullmq";
import {
  WebScraperOptions,
  RunWebScraperParams,
  RunWebScraperResult,
} from "../types";
import { billTeam } from "../services/billing/credit_billing";
import { Document } from "../controllers/v1/types";
import { supabase_service } from "../services/supabase";
import { logger as _logger } from "../lib/logger";
import { ScrapeEvents } from "../lib/scrape-events";
import { configDotenv } from "dotenv";
import {
  EngineResultsTracker,
  scrapeURL,
  ScrapeUrlResponse,
} from "../scraper/scrapeURL";
import { Engine } from "../scraper/scrapeURL/engines";
import { indexPage } from "../lib/extract/index/pinecone";
configDotenv();

export async function startWebScraperPipeline({
  job,
  token,
}: {
  job: Job<WebScraperOptions> & { id: string };
  token: string;
}) {
  return await runWebScraper({
    url: job.data.url,
    mode: job.data.mode,
    scrapeOptions: {
      ...job.data.scrapeOptions,
      ...(job.data.crawl_id
        ? {
            formats: job.data.scrapeOptions.formats.concat(["rawHtml"]),
          }
        : {}),
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
    is_crawl: !!(job.data.crawl_id && job.data.crawlerOptions !== null),
  });
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
  is_scrape = false,
  is_crawl = false,
}: RunWebScraperParams): Promise<ScrapeUrlResponse> {
  const logger = _logger.child({
    method: "runWebScraper",
    module: "runWebscraper",
    scrapeId: bull_job_id,
    jobId: bull_job_id,
  });
  const tries = is_crawl ? 3 : 1;

  let response: ScrapeUrlResponse | undefined = undefined;
  let engines: EngineResultsTracker = {};
  let error: any = undefined;

  for (let i = 0; i < tries; i++) {
    if (i > 0) {
      logger.debug("Retrying scrape...", {
        tries,
        i,
        previousStatusCode: (response as any)?.document?.metadata?.statusCode,
        previousError: error,
      });
    }

    response = undefined;
    engines = {};
    error = undefined;

    try {
      response = await scrapeURL(bull_job_id, url, scrapeOptions, {
        priority,
        ...internalOptions,
      });
      if (!response.success) {
        if (response.error instanceof Error) {
          throw response.error;
        } else {
          throw new Error(
            "scrapeURL error: " +
              (Array.isArray(response.error)
                ? JSON.stringify(response.error)
                : typeof response.error === "object"
                  ? JSON.stringify({ ...response.error })
                  : response.error),
          );
        }
      }

      // This is where the returnvalue from the job is set
      // onSuccess(response.document, mode);

      engines = response.engines;

      if (
        (response.document.metadata.statusCode >= 200 &&
          response.document.metadata.statusCode < 300) ||
        response.document.metadata.statusCode === 304
      ) {
        // status code is good -- do not attempt retry
        break;
      }
    } catch (_error) {
      error = _error;
      engines =
        response !== undefined
          ? response.engines
          : typeof error === "object" && error !== null
            ? ((error as any).results ?? {})
            : {};
    }
  }

  const engineOrder = Object.entries(engines)
    .sort((a, b) => a[1].startedAt - b[1].startedAt)
    .map((x) => x[0]) as Engine[];

  for (const engine of engineOrder) {
    const result = engines[engine] as Exclude<
      EngineResultsTracker[Engine],
      undefined
    >;
    ScrapeEvents.insert(bull_job_id, {
      type: "scrape",
      url,
      method: engine,
      result: {
        success: result.state === "success",
        response_code:
          result.state === "success" ? result.result.statusCode : undefined,
        response_size:
          result.state === "success" ? result.result.html.length : undefined,
        error:
          result.state === "error"
            ? result.error
            : result.state === "timeout"
              ? "Timed out"
              : undefined,
        time_taken: result.finishedAt - result.startedAt,
      },
    });
  }

  if (error === undefined && response?.success) {
    return response;
  } else {
    if (response !== undefined) {
      return {
        ...response,
        success: false,
        error,
      };
    } else {
      return {
        success: false,
        error,
        logs: ["no logs -- error coming from runWebScraper"],
        engines,
      };
    }
  }
}

const saveJob = async (
  job: Job,
  result: any,
  token: string,
  mode: string,
  engines?: EngineResultsTracker,
) => {
  try {
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
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
    _logger.error(`🐂 Failed to update job status`, {
      module: "runWebScraper",
      method: "saveJob",
      jobId: job.id,
      scrapeId: job.id,
    });
  }
};
