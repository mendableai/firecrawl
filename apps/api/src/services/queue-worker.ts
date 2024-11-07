import "dotenv/config";
import "./sentry";
import * as Sentry from "@sentry/node";
import { CustomError } from "../lib/custom-error";
import {
  getScrapeQueue,
  redisConnection,
  scrapeQueueName,
} from "./queue-service";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { callWebhook } from "./webhook";
import { logJob } from "./logging/log_job";
import { Job, Queue } from "bullmq";
import { logger } from "../lib/logger";
import { Worker } from "bullmq";
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
import { addScrapeJob } from "./queue-jobs";
import {
  addJobPriority,
  deleteJobPriority,
  getJobPriority,
} from "../../src/lib/job-priority";
import { PlanType, RateLimiterMode } from "../types";
import { getJobs } from "..//controllers/v1/crawl-status";
import { configDotenv } from "dotenv";
import { scrapeOptions } from "../controllers/v1/types";
import { getRateLimiterPoints } from "./rate-limiter";
import { cleanOldConcurrencyLimitEntries, pushConcurrencyLimitActiveJob, removeConcurrencyLimitActiveJob, takeConcurrencyLimitedJob } from "../lib/concurrency-limit";
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

const processJobInternal = async (token: string, job: Job & { id: string }) => {
  const extendLockInterval = setInterval(async () => {
    logger.info(`🐂 Worker extending lock on job ${job.id}`);
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  await addJobPriority(job.data.team_id, job.id);
  let err = null;
  try {
    const result = await processJob(job, token);
    if (result.success) {
      try {
        if (job.data.crawl_id && process.env.USE_DB_AUTHENTICATION === "true") {
          await job.moveToCompleted(null, token, false);
        } else {
          await job.moveToCompleted(result.document, token, false);
        }
      } catch (e) {}
    } else {
      await job.moveToFailed((result as any).error, token, false);
    }
    
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
  console.log("Received SIGTERM. Shutting down gracefully...");
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Shutting down gracefully...");
  isShuttingDown = true;
});

const workerFun = async (
  queue: Queue,
  processJobInternal: (token: string, job: Job) => Promise<any>
) => {
  const worker = new Worker(queue.name, null, {
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
      async function afterJobDone(job: Job<any, any, string>) {
        if (job.id && job.data && job.data.team_id && job.data.plan) {
          await removeConcurrencyLimitActiveJob(job.data.team_id, job.id);
          cleanOldConcurrencyLimitEntries(job.data.team_id);

          // Queue up next job, if it exists
          // No need to check if we're under the limit here -- if the current job is finished,
          // we are 1 under the limit, assuming the job insertion logic never over-inserts. - MG
          const nextJob = await takeConcurrencyLimitedJob(job.data.team_id);
          if (nextJob !== null) {
            await pushConcurrencyLimitActiveJob(job.data.team_id, nextJob.id);

            await queue.add(nextJob.id, {
              ...nextJob.data,
              concurrencyLimitHit: true,
            }, {
              ...nextJob.opts,
              jobId: nextJob.id,
              priority: nextJob.priority,
            });
          }
        }
      }

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
                    let res;
                    try {
                      res = await processJobInternal(token, job);
                    } finally { 
                      await afterJobDone(job)
                    }
                    
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
            processJobInternal(token, job)
              .finally(() => afterJobDone(job));
          }
        );
      }

      await sleep(gotJobInterval);
    } else {
      await sleep(connectionMonitorInterval);
    }
  }
};

workerFun(getScrapeQueue(), processJobInternal);

async function processJob(job: Job & { id: string }, token: string) {
  logger.info(`🐂 Worker taking job ${job.id}`);

  // Check if the job URL is researchhub and block it immediately
  // TODO: remove this once solve the root issue
  if (
    job.data.url &&
    (job.data.url.includes("researchhub.com") ||
      job.data.url.includes("ebay.com") ||
      job.data.url.includes("youtube.com") ||
      job.data.url.includes("microsoft.com"))
  ) {
    logger.info(`🐂 Blocking job ${job.id} with URL ${job.data.url}`);
    const data = {
      success: false,
      document: null,
      project_id: job.data.project_id,
      error:
        "URL is blocked. Suspecious activity detected. Please contact hello@firecrawl.com if you believe this is an error.",
    };
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

    const pipeline = await startWebScraperPipeline({
      job,
      token,
    });

    if (!pipeline.success) {
      // TODO: let's Not do this
      throw pipeline.error;
    }

    const end = Date.now();
    const timeTakenInSeconds = (end - start) / 1000;

    const doc = pipeline.document;

    const rawHtml = doc.rawHtml ?? "";

    const data = {
      success: true,
      result: {
        links: [{
          content: doc,
          source: doc?.metadata?.sourceURL ?? doc?.metadata?.url ?? "",
        }],
      },
      project_id: job.data.project_id,
      document: doc,
    };

    if (job.data.webhook && job.data.mode !== "crawl" && job.data.v1) {
      await callWebhook(
        job.data.team_id,
        job.data.crawl_id,
        data,
        job.data.webhook,
        job.data.v1,
        job.data.crawlerOptions !== null ? "crawl.page" : "batch_scrape.page",
        true
      );
    }

    if (job.data.crawl_id) {
      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

      await logJob({
        job_id: job.id as string,
        success: true,
        num_docs: 1,
        docs: [doc],
        time_taken: timeTakenInSeconds,
        team_id: job.data.team_id,
        mode: job.data.mode,
        url: job.data.url,
        crawlerOptions: sc.crawlerOptions,
        scrapeOptions: job.data.scrapeOptions,
        origin: job.data.origin,
        crawl_id: job.data.crawl_id,
      });

      await addCrawlJobDone(job.data.crawl_id, job.id);

      if (!job.data.sitemapped && job.data.crawlerOptions !== null) {
        if (!sc.cancelled) {
          const crawler = crawlToCrawler(job.data.crawl_id, sc);

          const links = crawler.filterLinks(
            crawler.extractLinksFromHTML(rawHtml ?? "", sc.originUrl as string),
            Infinity,
            sc.crawlerOptions?.maxDepth ?? 10
          );

          for (const link of links) {
            if (await lockURL(job.data.crawl_id, sc, link)) {
              // This seems to work really welel
              const jobPriority = await getJobPriority({
                plan: sc.plan as PlanType,
                team_id: sc.team_id,
                basePriority: job.data.crawl_id ? 20 : 10,
              });
              const jobId = uuidv4();

              // console.log("plan: ",  sc.plan);
              // console.log("team_id: ", sc.team_id)
              // console.log("base priority: ", job.data.crawl_id ? 20 : 10)
              // console.log("job priority: " , jobPriority, "\n\n\n")

              await addScrapeJob(
                {
                  url: link,
                  mode: "single_urls",
                  team_id: sc.team_id,
                  scrapeOptions: scrapeOptions.parse(sc.scrapeOptions),
                  internalOptions: sc.internalOptions,
                  plan: job.data.plan,
                  origin: job.data.origin,
                  crawl_id: job.data.crawl_id,
                  webhook: job.data.webhook,
                  v1: job.data.v1,
                },
                {},
                jobId,
                jobPriority
              );

              await addCrawlJob(job.data.crawl_id, jobId);
            }
          }
        }
      }

      if (await finishCrawl(job.data.crawl_id)) {
        if (!job.data.v1) {
          const jobIDs = await getCrawlJobs(job.data.crawl_id);

          const jobs = (await getJobs(jobIDs)).sort((a, b) => a.timestamp - b.timestamp);
          const jobStatuses = await Promise.all(jobs.map((x) => x.getState()));
          const jobStatus =
            sc.cancelled || jobStatuses.some((x) => x === "failed")
              ? "failed"
              : "completed";

          const fullDocs = jobs.map((x) =>
            Array.isArray(x.returnvalue) ? x.returnvalue[0] : x.returnvalue
          );

          await logJob({
            job_id: job.data.crawl_id,
            success: jobStatus === "completed",
            message: sc.cancelled ? "Cancelled" : undefined,
            num_docs: fullDocs.length,
            docs: [],
            time_taken: (Date.now() - sc.createdAt) / 1000,
            team_id: job.data.team_id,
            mode: job.data.crawlerOptions !== null ? "crawl" : "batch_scrape",
            url: sc.originUrl!,
            scrapeOptions: sc.scrapeOptions,
            crawlerOptions: sc.crawlerOptions,
            origin: job.data.origin,
          });

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
              job.data.crawlerOptions !== null ? "crawl.completed" : "batch_scrape.completed"
            );
          }
        } else {
          const jobIDs = await getCrawlJobs(job.data.crawl_id);
          const jobStatus =
            sc.cancelled
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
              job.data.crawlerOptions !== null ? "crawl.completed" : "batch_scrape.completed"
              );
            }

          await logJob({
            job_id: job.data.crawl_id,
            success: jobStatus === "completed",
            message: sc.cancelled ? "Cancelled" : undefined,
            num_docs: jobIDs.length,
            docs: [],
            time_taken: (Date.now() - sc.createdAt) / 1000,
            team_id: job.data.team_id,
            scrapeOptions: sc.scrapeOptions,
            mode: job.data.crawlerOptions !== null ? "crawl" : "batch_scrape",
            url: sc?.originUrl ?? (job.data.crawlerOptions === null ? "Batch Scrape" : "Unknown"),
            crawlerOptions: sc.crawlerOptions,
            origin: job.data.origin,
          });
        }
      }
    }

    logger.info(`🐂 Job done ${job.id}`);
    return data;
  } catch (error) {
    logger.error(`🐂 Job errored ${job.id} - ${error}`);

    Sentry.captureException(error, {
      data: {
        job: job.id,
      },
    });

    if (error instanceof CustomError) {
      // Here we handle the error, then save the failed job
      logger.error(error.message); // or any other error handling
    }
    logger.error(error);
    if (error.stack) {
      logger.error(error.stack);
    }

    const data = {
      success: false,
      document: null,
      project_id: job.data.project_id,
      error: error instanceof Error ? error : typeof error === "string" ? new Error(error) : new Error(JSON.stringify(error)),
    };

    if (!job.data.v1 && (job.data.mode === "crawl" || job.data.crawl_id)) {
      callWebhook(
        job.data.team_id,
        job.data.crawl_id ?? (job.id as string),
        data,
        job.data.webhook,
        job.data.v1,
        job.data.crawlerOptions !== null ? "crawl.page" : "batch_scrape.page",
      );
    }
    // if (job.data.v1) {
    //   callWebhook(
    //     job.data.team_id,
    //     job.id as string,
    //     [],
    //     job.data.webhook,
    //     job.data.v1,
    //     "crawl.failed"
    //   );
    // }

    if (job.data.crawl_id) {
      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

      await logJob({
        job_id: job.id as string,
        success: false,
        message:
          typeof error === "string"
            ? error
            : error.message ??
              "Something went wrong... Contact help@mendable.ai",
        num_docs: 0,
        docs: [],
        time_taken: 0,
        team_id: job.data.team_id,
        mode: job.data.mode,
        url: job.data.url,
        crawlerOptions: sc.crawlerOptions,
        scrapeOptions: job.data.scrapeOptions,
        origin: job.data.origin,
        crawl_id: job.data.crawl_id,
      });

      await logJob({
        job_id: job.data.crawl_id,
        success: false,
        message:
          typeof error === "string"
            ? error
            : error.message ??
              "Something went wrong... Contact help@mendable.ai",
        num_docs: 0,
        docs: [],
        time_taken: 0,
        team_id: job.data.team_id,
        mode: job.data.crawlerOptions !== null ? "crawl" : "batch_scrape",
        url: sc ? sc.originUrl : job.data.url,
        crawlerOptions: sc ? sc.crawlerOptions : undefined,
        scrapeOptions: sc ? sc.scrapeOptions : job.data.scrapeOptions,
        origin: job.data.origin,
      });
    }
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
