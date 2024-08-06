import { CustomError } from "../lib/custom-error";
import {
  getWebScraperQueue,
  getScrapeQueue,
  redisConnection,
  webScraperQueueName,
  scrapeQueueName,
} from "./queue-service";
import "dotenv/config";
import { logtail } from "./logtail";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { callWebhook } from "./webhook";
import { logJob } from "./logging/log_job";
import { initSDK } from "@hyperdx/node-opentelemetry";
import { Job, QueueEvents, tryCatch } from "bullmq";
import { Logger } from "../lib/logger";
import { ScrapeEvents } from "../lib/scrape-events";
import { Worker } from "bullmq";
import systemMonitor from "./system-monitor";
import { v4 as uuidv4 } from "uuid";

if (process.env.ENV === "production") {
  initSDK({
    consoleCapture: true,
    additionalInstrumentations: [],
  });
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const workerLockDuration = Number(process.env.WORKER_LOCK_DURATION) || 60000;
const workerStalledCheckInterval =
  Number(process.env.WORKER_STALLED_CHECK_INTERVAL) || 30000;
const jobLockExtendInterval =
  Number(process.env.JOB_LOCK_EXTEND_INTERVAL) || 15000;
const jobLockExtensionTime =
  Number(process.env.JOB_LOCK_EXTENSION_TIME) || 15000;

const cantAcceptConnectionInterval =
  Number(process.env.CANT_ACCEPT_CONNECTION_INTERVAL) || 2000;
const connectionMonitorInterval =
  Number(process.env.CONNECTION_MONITOR_INTERVAL) || 10;
const gotJobInterval = Number(process.env.CONNECTION_MONITOR_INTERVAL) || 20;
const wsq = getWebScraperQueue();
const sq = getScrapeQueue();

const processJobInternal = async (token: string, job: Job) => {
  const extendLockInterval = setInterval(async () => {
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  try {
    const result = await processJob(job, token);
    const jobState = await job.getState();
    if(jobState !== "completed" && jobState !== "failed"){
      try{
        await job.moveToCompleted(result.docs, token, false); //3rd arg fetchNext
      }catch(e){
        // console.log("Job already completed, error:", e);
      }
    }
  } catch (error) {
    console.log("Job failed, error:", error);

    await job.moveToFailed(error, token, false);
  } finally {
    clearInterval(extendLockInterval);
  }
};

let isShuttingDown = false;

process.on("SIGINT", () => {
  console.log("Received SIGINT. Shutting down gracefully...");
  isShuttingDown = true;
});

const workerFun = async (queueName: string, processJobInternal: (token: string, job: Job) => Promise<void>) => {
  const worker = new Worker(queueName, null, {
    connection: redisConnection,
    lockDuration: 1 * 60 * 1000, // 1 minute
    // lockRenewTime: 15 * 1000, // 15 seconds
    stalledInterval: 30 * 1000, // 30 seconds
    maxStalledCount: 10, // 10 times
  });

  worker.startStalledCheckTimer();

  const monitor = await systemMonitor;

  while (true) {
    if (isShuttingDown) {
      console.log("No longer accepting new jobs. SIGINT");
      break;
    }
    const token = uuidv4();
    const canAcceptConnection = await monitor.acceptConnection();
    if (!canAcceptConnection) {
      console.log("Cant accept connection");
      await sleep(cantAcceptConnectionInterval); // more sleep
      continue;
    }

    const job = await worker.getNextJob(token);
    if (job) {
      processJobInternal(token, job);
      await sleep(gotJobInterval);
    } else {
      await sleep(connectionMonitorInterval);
    }
  }
};

workerFun(webScraperQueueName, processJobInternal);
workerFun(scrapeQueueName, processJobInternal);

async function processJob(job: Job, token: string) {
  Logger.debug(`🐂 Worker taking job ${job.id}`);

  try {
    job.updateProgress({
      current: 1,
      total: 100,
      current_step: "SCRAPING",
      current_url: "",
    });
    const start = Date.now();
    const { success, message, docs } = await startWebScraperPipeline({
      job,
      token,
    });
    const end = Date.now();
    const timeTakenInSeconds = (end - start) / 1000;

    const isCancelled = await (await getWebScraperQueue().client).exists("cancelled:" + job.id);

    if (isCancelled) {
      await job.discard();
      await job.moveToFailed(Error("Job cancelled by user"), job.token);
      await job.discard();
    }

    const data = {
      success,
      result: {
        links: isCancelled ? [] : docs.map((doc) => {
          return {
            content: doc,
            source: doc?.metadata?.sourceURL ?? doc?.url ?? "",
          };
        }),
      },
      project_id: job.data.project_id,
      error: isCancelled ? "Job cancelled by user" : message /* etc... */,
      docs: isCancelled ? [] : docs,
    };

    if (job.data.mode === "crawl" && !isCancelled) {
      await callWebhook(job.data.team_id, job.id as string, data);
    }

    await logJob({
      job_id: job.id as string,
      success: success && !isCancelled,
      message: isCancelled ? "Job cancelled by user" : message,
      num_docs: isCancelled ? 0 : docs.length,
      docs: isCancelled ? [] : docs,
      time_taken: timeTakenInSeconds,
      team_id: job.data.team_id,
      mode: job.data.mode,
      url: job.data.url,
      crawlerOptions: job.data.crawlerOptions,
      pageOptions: job.data.pageOptions,
      origin: job.data.origin,
    });
    Logger.debug(`🐂 Job done ${job.id}`);
    return data;
  } catch (error) {
    Logger.error(`🐂 Job errored ${job.id} - ${error}`);
    if (await getWebScraperQueue().isPaused()) {
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
      docs: [],
      project_id: job.data.project_id,
      error:
        "Something went wrong... Contact help@mendable.ai or try again." /* etc... */,
    };
    if (job.data.mode === "crawl") {
      await callWebhook(job.data.team_id, job.id as string, data);
    }
    await logJob({
      job_id: job.id as string,
      success: false,
      message:
        typeof error === "string"
          ? error
          : error.message ?? "Something went wrong... Contact help@mendable.ai",
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
    // done(null, data);
    return data;
  }
}

// wsq.process(
//   Math.floor(Number(process.env.NUM_WORKERS_PER_QUEUE ?? 8)),
//   processJob
// );

// wsq.on("waiting", j => ScrapeEvents.logJobEvent(j, "waiting"));
// wsq.on("active", j => ScrapeEvents.logJobEvent(j, "active"));
// wsq.on("completed", j => ScrapeEvents.logJobEvent(j, "completed"));
// wsq.on("paused", j => ScrapeEvents.logJobEvent(j, "paused"));
// wsq.on("resumed", j => ScrapeEvents.logJobEvent(j, "resumed"));
// wsq.on("removed", j => ScrapeEvents.logJobEvent(j, "removed"));
