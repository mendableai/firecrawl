import "dotenv/config";
import "./sentry";
import * as Sentry from "@sentry/node";
import { CustomError } from "../lib/custom-error";
import {
  getScrapeQueue,
  redisConnection,
  scrapeQueueName,
} from "./queue-service";
import { logtail } from "./logtail";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { callWebhook } from "./webhook";
import { Logger } from "../lib/logger";
import { Job, Worker } from "bullmq";
import systemMonitor from "./system-monitor";
import { v4 as uuidv4 } from "uuid";
import {
  addCrawlJob,
  addCrawlJobDone,
  crawlToCrawler,
  finishCrawl,
  getCrawl,
  getCrawlJobs,
  lockURL,
} from "../lib/crawl-redis";
import { StoredCrawl } from "../lib/crawl-redis";
import { addScrapeJobRaw } from "./queue-jobs";
import {
  addJobPriority,
  deleteJobPriority,
  getJobPriority,
} from "../../src/lib/job-priority";
import { PlanType } from "../types";
import { getJobs } from "../../src/controllers/v1/crawl-status";
import { configDotenv } from "dotenv";
configDotenv();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const workerLockDuration = Number(process.env.WORKER_LOCK_DURATION) || 60000;
const workerStalledCheckInterval =
  Number(process.env.WORKER_STALLED_CHECK_INTERVAL) || 30000;
const jobLockExtendInterval =
  Number(process.env.JOB_LOCK_EXTEND_INTERVAL) || 15000;
const jobLockExtensionTime =
  Number(process.env.JOB_LOCK_EXTENSION_TIME) || 60000;

const cantAcceptConnectionInterval =
  Number(process.env.CANT_ACCEPT_CONNECTION_INTERVAL) || 2000;
const connectionMonitorInterval =
  Number(process.env.CONNECTION_MONITOR_INTERVAL) || 10;
const gotJobInterval = Number(process.env.CONNECTION_MONITOR_INTERVAL) || 20;

const processJobInternal = async (token: string, job: Job) => {
  const extendLockInterval = setInterval(async () => {
    Logger.info(`🐂 Worker extending lock on job ${job.id}`);
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  await addJobPriority(job.data.team_id, job.id);
  let err = null;
  try {
    const result = await processJob(job, token);
    try {
      await job.moveToCompleted(result.docs, token, false);
    } catch (e) {}
  } catch (error) {
    console.log("Job failed, error:", error);
    Sentry.captureException(error);
    err = error;
    await job.moveToFailed(error, token, false);
  } finally {
    await deleteJobPriority(job.data.team_id, job.id);
    clearInterval(extendLockInterval);
  }

  return err;
};

let isShuttingDown = false;

process.on("SIGINT", () => {
  console.log("Received SIGINT. Shutting down gracefully...");
  isShuttingDown = true;
});

const workerFun = async (
  queueName: string,
  processJobInternal: (token: string, job: Job) => Promise<any>
) => {
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
      if (job.data && job.data.sentry && Sentry.isInitialized()) {
        Sentry.continueTrace(
          {
            sentryTrace: job.data.sentry.trace,
            baggage: job.data.sentry.baggage,
          },
          () => {
            Sentry.startSpan(
              {
                name: "Scrape job",
                attributes: {
                  job: job.id,
                  worker: process.env.FLY_MACHINE_ID ?? worker.id,
                },
              },
              async (span) => {
                await Sentry.startSpan(
                  {
                    name: "Process scrape job",
                    op: "queue.process",
                    attributes: {
                      "messaging.message.id": job.id,
                      "messaging.destination.name": getScrapeQueue().name,
                      "messaging.message.body.size": job.data.sentry.size,
                      "messaging.message.receive.latency":
                        Date.now() - (job.processedOn ?? job.timestamp),
                      "messaging.message.retry.count": job.attemptsMade,
                    },
                  },
                  async () => {
                    const res = await processJobInternal(token, job);
                    if (res !== null) {
                      span.setStatus({ code: 2 }); // ERROR
                    } else {
                      span.setStatus({ code: 1 }); // OK
                    }
                  }
                );
              }
            );
          }
        );
      } else {
        Sentry.startSpan(
          {
            name: "Scrape job",
            attributes: {
              job: job.id,
              worker: process.env.FLY_MACHINE_ID ?? worker.id,
            },
          },
          () => {
            processJobInternal(token, job);
          }
        );
      }

      await sleep(gotJobInterval);
    } else {
      await sleep(connectionMonitorInterval);
    }
  }
};

workerFun(scrapeQueueName, processJobInternal);

async function processJob(job: Job, token: string) {
  Logger.info(`🐂 Worker taking job ${job.id}`);

  // Check if the job URL is researchhub and block it immediately
  // TODO: remove this once solve the root issue
  if (
    job.data.url &&
    (job.data.url.includes("researchhub.com") ||
      job.data.url.includes("ebay.com") ||
      job.data.url.includes("youtube.com"))
  ) {
    Logger.info(`🐂 Blocking job ${job.id} with URL ${job.data.url}`);
    const data = {
      success: false,
      docs: [],
      project_id: job.data.project_id,
      error:
        "URL is blocked. Suspecious activity detected. Please contact hello@firecrawl.com if you believe this is an error.",
    };
    await job.moveToCompleted(data.docs, token, false);
    return data;
  }

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

    // Better if we throw here so we capture with the correct error
    if (!success) {
      throw new Error(message);
    }
    const end = Date.now();
    const timeTakenInSeconds = (end - start) / 1000;

    const rawHtml = docs[0] ? docs[0].rawHtml : "";

    const data = {
      success,
      result: {
        links: docs.map((doc) => {
          return {
            content: doc,
            source: doc?.metadata?.sourceURL ?? doc?.url ?? "",
          };
        }),
      },
      project_id: job.data.project_id,
      error: message /* etc... */,
      docs,
    };

    if (job.data.crawl_id) {
      await addCrawlJobDone(job.data.crawl_id, job.id);

      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

      if (!job.data.sitemapped) {
        if (!sc.cancelled) {
          const crawler = crawlToCrawler(job.data.crawl_id, sc);

          const links = crawler.extractLinksFromHTML(
            rawHtml,
            docs[0]?.metadata?.sourceURL ?? docs[0]?.url ?? ""
          );

          for (const link of links) {
            if (await lockURL(job.data.crawl_id, sc, link)) {
              const jobPriority = await getJobPriority({
                plan: sc.plan as PlanType,
                team_id: sc.team_id,
                basePriority: job.data.crawl_id ? 20 : 10,
              });
              Logger.debug(`🐂 Adding scrape job for link ${link}`);
              const newJob = await addScrapeJobRaw(
                {
                  url: link,
                  mode: "single_urls",
                  crawlerOptions: sc.crawlerOptions,
                  team_id: sc.team_id,
                  pageOptions: sc.pageOptions,
                  origin: job.data.origin,
                  crawl_id: job.data.crawl_id,
                  v1: job.data.v1,
                },
                {},
                uuidv4(),
                jobPriority
              );

              await addCrawlJob(job.data.crawl_id, newJob.id);
            }
          }
        }
      }

      if (await finishCrawl(job.data.crawl_id)) {
        if (!job.data.v1) {
          const jobIDs = await getCrawlJobs(job.data.crawl_id);

          const jobs = (await getJobs(jobIDs)).sort(
            (a, b) => a.timestamp - b.timestamp
          );
          const jobStatuses = await Promise.all(jobs.map((x) => x.getState()));
          const jobStatus =
            sc.cancelled || jobStatuses.some((x) => x === "failed")
              ? "failed"
              : "completed";

          const fullDocs = jobs.map((x) =>
            Array.isArray(x.returnvalue) ? x.returnvalue[0] : x.returnvalue
          );

          const data = {
            success: jobStatus !== "failed",
            result: {
              links: fullDocs.map((doc) => {
                return {
                  content: doc,
                  source: doc?.metadata?.sourceURL ?? doc?.url ?? "",
                };
              }),
            },
            project_id: job.data.project_id,
            error: message /* etc... */,
            docs: fullDocs,
          };

          // v0 web hooks, call when done with all the data
          if (!job.data.v1) {
            callWebhook(
              job.data.team_id,
              job.data.crawl_id,
              data,
              job.data.webhook,
              job.data.v1,
              "crawl.completed"
            );
          }
        } else {
          const jobIDs = await getCrawlJobs(job.data.crawl_id);
          const jobStatuses = await Promise.all(
            jobIDs.map((x) => getScrapeQueue().getJobState(x))
          );
          const jobStatus =
            sc.cancelled || jobStatuses.some((x) => x === "failed")
              ? "failed"
              : "completed";

          // v1 web hooks, call when done with no data, but with event completed
          if (job.data.v1 && job.data.webhook) {
            callWebhook(
              job.data.team_id,
              job.data.crawl_id,
              [],
              job.data.webhook,
              job.data.v1,
              "crawl.completed"
            );
          }
        }
      }
    }

    Logger.info(`🐂 Job done ${job.id}`);
    return data;
  } catch (error) {
    Logger.error(`🐂 Job errored ${job.id} - ${error}`);

    if (
      !(
        error instanceof Error &&
        error.message.includes("JSON parsing error(s): ")
      )
    ) {
      Sentry.captureException(error, {
        data: {
          job: job.id,
        },
      });
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
    if (error.stack) {
      Logger.error(error.stack);
    }

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

    if (!job.data.v1 && (job.data.mode === "crawl" || job.data.crawl_id)) {
      callWebhook(
        job.data.team_id,
        job.data.crawl_id ?? (job.id as string),
        data,
        job.data.webhook,
        job.data.v1
      );
    }
    if (job.data.v1) {
      callWebhook(
        job.data.team_id,
        job.id as string,
        [],
        job.data.webhook,
        job.data.v1,
        "crawl.failed"
      );
    }

    // done(null, data);
    return data;
  }
}
