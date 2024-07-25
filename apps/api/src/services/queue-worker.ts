import { CustomError } from "../lib/custom-error";
import { getWebScraperQueue } from "./queue-service";
import "dotenv/config";
import { logtail } from "./logtail";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { callWebhook } from "./webhook";
import { logJob } from "./logging/log_job";
import { initSDK } from '@hyperdx/node-opentelemetry';
import { Job } from "bull";
import { Logger } from "../lib/logger";
import { ScrapeEvents } from "../lib/scrape-events";

if (process.env.ENV === 'production') {
  initSDK({
    consoleCapture: true,
    additionalInstrumentations: [],
  });
}

const wsq = getWebScraperQueue();

async function processJob(job: Job, done) {
  Logger.debug(`🐂 Worker taking job ${job.id}`);

  try {
    job.progress({
      current: 1,
      total: 100,
      current_step: "SCRAPING",
      current_url: "",
    });
    const start = Date.now();
    const { success, message, docs } = await startWebScraperPipeline({ job });
    const end = Date.now();
    const timeTakenInSeconds = (end - start) / 1000;

    const data = {
      success: success,
      result: {
        links: docs.map((doc) => {
          return { content: doc, source: doc?.metadata?.sourceURL ?? doc?.url ?? "" };
        }),
      },
      project_id: job.data.project_id,
      error: message /* etc... */,
    };

    await callWebhook(job.data.team_id, job.id as string, data);

    await logJob({
      job_id: job.id as string,
      success: success,
      message: message,
      num_docs: docs.length,
      docs: docs,
      time_taken: timeTakenInSeconds,
      team_id: job.data.team_id,
      mode: "crawl",
      url: job.data.url,
      crawlerOptions: job.data.crawlerOptions,
      pageOptions: job.data.pageOptions,
      origin: job.data.origin,
    });
    Logger.debug(`🐂 Job done ${job.id}`);
    done(null, data);
  } catch (error) {
    Logger.error(`🐂 Job errored ${job.id} - ${error}`);
    if (await getWebScraperQueue().isPaused(false)) {
      Logger.debug("🐂Queue is paused, ignoring");
      return;
    }

    if (error instanceof CustomError) {
      // Here we handle the error, then save the failed job
      Logger.error(error.message); // or any other error handling

      logtail.error("Custom error while ingesting", {
        job_id: job.id,
        error: error.message,
        dataIngestionJob: error.dataIngestionJob,
      });
    }
    Logger.error(error);

    logtail.error("Overall error ingesting", {
      job_id: job.id,
      error: error.message,
    });

    const data = {
      success: false,
      project_id: job.data.project_id,
      error:
        "Something went wrong... Contact help@mendable.ai or try again." /* etc... */,
    };
    await callWebhook(job.data.team_id, job.id as string, data);
    await logJob({
      job_id: job.id as string,
      success: false,
      message: typeof error === 'string' ? error : (error.message ?? "Something went wrong... Contact help@mendable.ai"),
      num_docs: 0,
      docs: [],
      time_taken: 0,
      team_id: job.data.team_id,
      mode: "crawl",
      url: job.data.url,
      crawlerOptions: job.data.crawlerOptions,
      pageOptions: job.data.pageOptions,
      origin: job.data.origin,
    });
    done(null, data);
  }
}

wsq.process(
  Math.floor(Number(process.env.NUM_WORKERS_PER_QUEUE ?? 8)),
  processJob
);

wsq.on("waiting", j => ScrapeEvents.logJobEvent(j, "waiting"));
wsq.on("active", j => ScrapeEvents.logJobEvent(j, "active"));
wsq.on("completed", j => ScrapeEvents.logJobEvent(j, "completed"));
wsq.on("paused", j => ScrapeEvents.logJobEvent(j, "paused"));
wsq.on("resumed", j => ScrapeEvents.logJobEvent(j, "resumed"));
wsq.on("removed", j => ScrapeEvents.logJobEvent(j, "removed"));
