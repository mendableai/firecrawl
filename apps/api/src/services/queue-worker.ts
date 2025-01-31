import "dotenv/config";
import "./sentry";
import * as Sentry from "@sentry/node";
import { CustomError } from "../lib/custom-error";
import {
  getScrapeQueue,
  getExtractQueue,
  redisConnection,
  scrapeQueueName,
  extractQueueName,
  getIndexQueue,
} from "./queue-service";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { callWebhook } from "./webhook";
import { logJob } from "./logging/log_job";
import { Job, Queue } from "bullmq";
import { logger as _logger } from "../lib/logger";
import { Worker } from "bullmq";
import systemMonitor from "./system-monitor";
import { v4 as uuidv4 } from "uuid";
import {
  addCrawlJob,
  addCrawlJobDone,
  addCrawlJobs,
  crawlToCrawler,
  finishCrawl,
  finishCrawlKickoff,
  generateURLPermutations,
  getCrawl,
  getCrawlJobCount,
  getCrawlJobs,
  lockURL,
  lockURLs,
  lockURLsIndividually,
  normalizeURL,
  saveCrawl,
} from "../lib/crawl-redis";
import { StoredCrawl } from "../lib/crawl-redis";
import { addScrapeJob, addScrapeJobs } from "./queue-jobs";
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
import {
  calculateJobTimeToRun,
  cleanOldConcurrencyLimitEntries,
  pushConcurrencyLimitActiveJob,
  removeConcurrencyLimitActiveJob,
  takeConcurrencyLimitedJob,
} from "../lib/concurrency-limit";
import { isUrlBlocked } from "../scraper/WebScraper/utils/blocklist";
import { BLOCKLISTED_URL_MESSAGE } from "../lib/strings";
import { indexPage } from "../lib/extract/index/pinecone";
import { Document } from "../controllers/v1/types";
import { performExtraction } from "../lib/extract/extraction-service";
import { supabase_service } from "../services/supabase";
import { normalizeUrl, normalizeUrlOnlyHostname } from "../lib/canonical-url";
import { saveExtract, updateExtract } from "../lib/extract/extract-redis";
import { billTeam } from "./billing/credit_billing";
import { saveCrawlMap } from "./indexing/crawl-maps-index";

configDotenv();

class RacedRedirectError extends Error {
  constructor() {
    super("Raced redirect error");
  }
}

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

const runningJobs: Set<string> = new Set();

async function finishCrawlIfNeeded(job: Job & { id: string }, sc: StoredCrawl) {
  if (await finishCrawl(job.data.crawl_id)) {
    (async () => {
      const originUrl = sc.originUrl
        ? normalizeUrlOnlyHostname(sc.originUrl)
        : undefined;
      // Get all visited unique URLs from Redis
      const visitedUrls = await redisConnection.smembers(
        "crawl:" + job.data.crawl_id + ":visited_unique",
      );
      // Upload to Supabase if we have URLs and this is a crawl (not a batch scrape)
      if (
        visitedUrls.length > 0 &&
        job.data.crawlerOptions !== null &&
        originUrl
      ) {
        // Queue the indexing job instead of doing it directly
        await getIndexQueue().add(
          job.data.crawl_id,
          {
            originUrl,
            visitedUrls,
          },
          {
            priority: 10,
          },
        );
      }
    })();

    if (!job.data.v1) {
      const jobIDs = await getCrawlJobs(job.data.crawl_id);

      const jobs = (await getJobs(jobIDs)).sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      // const jobStatuses = await Promise.all(jobs.map((x) => x.getState()));
      const jobStatus = sc.cancelled // || jobStatuses.some((x) => x === "failed")
        ? "failed"
        : "completed";

      const fullDocs = jobs
        .map((x) =>
          x.returnvalue
            ? Array.isArray(x.returnvalue)
              ? x.returnvalue[0]
              : x.returnvalue
            : null,
        )
        .filter((x) => x !== null);

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
          job.data.crawlerOptions !== null
            ? "crawl.completed"
            : "batch_scrape.completed",
        );
      }
    } else {
      const num_docs = await getCrawlJobCount(job.data.crawl_id);
      const jobStatus = sc.cancelled ? "failed" : "completed";

      await logJob(
        {
          job_id: job.data.crawl_id,
          success: jobStatus === "completed",
          message: sc.cancelled ? "Cancelled" : undefined,
          num_docs,
          docs: [],
          time_taken: (Date.now() - sc.createdAt) / 1000,
          team_id: job.data.team_id,
          scrapeOptions: sc.scrapeOptions,
          mode: job.data.crawlerOptions !== null ? "crawl" : "batch_scrape",
          url:
            sc?.originUrl ??
            (job.data.crawlerOptions === null ? "Batch Scrape" : "Unknown"),
          crawlerOptions: sc.crawlerOptions,
          origin: job.data.origin,
        },
        true,
      );

      // v1 web hooks, call when done with no data, but with event completed
      if (job.data.v1 && job.data.webhook) {
        callWebhook(
          job.data.team_id,
          job.data.crawl_id,
          [],
          job.data.webhook,
          job.data.v1,
          job.data.crawlerOptions !== null
            ? "crawl.completed"
            : "batch_scrape.completed",
        );
      }
    }
  }
}

const processJobInternal = async (token: string, job: Job & { id: string }) => {
  const logger = _logger.child({
    module: "queue-worker",
    method: "processJobInternal",
    jobId: job.id,
    scrapeId: job.id,
    crawlId: job.data?.crawl_id ?? undefined,
  });

  const extendLockInterval = setInterval(async () => {
    logger.info(`🐂 Worker extending lock on job ${job.id}`, {
      extendInterval: jobLockExtendInterval,
      extensionTime: jobLockExtensionTime,
    });
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  await addJobPriority(job.data.team_id, job.id);
  let err = null;
  try {
    if (job.data?.mode === "kickoff") {
      const result = await processKickoffJob(job, token);
      if (result.success) {
        try {
          await job.moveToCompleted(null, token, false);
        } catch (e) {}
      } else {
        logger.debug("Job failed", { result, mode: job.data.mode });
        await job.moveToFailed((result as any).error, token, false);
      }
    } else {
      const result = await processJob(job, token);
      if (result.success) {
        try {
          if (
            job.data.crawl_id &&
            process.env.USE_DB_AUTHENTICATION === "true"
          ) {
            logger.debug(
              "Job succeeded -- has crawl associated, putting null in Redis",
            );
            await job.moveToCompleted(null, token, false);
          } else {
            logger.debug("Job succeeded -- putting result in Redis");
            await job.moveToCompleted(result.document, token, false);
          }
        } catch (e) {}
      } else {
        logger.debug("Job failed", { result });
        await job.moveToFailed((result as any).error, token, false);
      }
    }
  } catch (error) {
    logger.debug("Job failed", { error });
    Sentry.captureException(error);
    err = error;
    await job.moveToFailed(error, token, false);
  } finally {
    await deleteJobPriority(job.data.team_id, job.id);
    clearInterval(extendLockInterval);
  }

  return err;
};

const processExtractJobInternal = async (
  token: string,
  job: Job & { id: string },
) => {
  const logger = _logger.child({
    module: "extract-worker",
    method: "processJobInternal",
    jobId: job.id,
    extractId: job.data.extractId,
    teamId: job.data?.teamId ?? undefined,
  });

  const extendLockInterval = setInterval(async () => {
    logger.info(`🔄 Worker extending lock on job ${job.id}`);
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  try {
    const result = await performExtraction(job.data.extractId, {
      request: job.data.request,
      teamId: job.data.teamId,
      plan: job.data.plan,
      subId: job.data.subId,
    });

    if (result.success) {
      // Move job to completed state in Redis
      await job.moveToCompleted(result, token, false);
      return result;
    } else {
      // throw new Error(result.error || "Unknown error during extraction");

      await job.moveToCompleted(result, token, false);
      await updateExtract(job.data.extractId, {
        status: "failed",
        error:
          result.error ??
          "Unknown error, please contact help@firecrawl.com. Extract id: " +
            job.data.extractId,
      });

      return result;
    }
  } catch (error) {
    logger.error(`🚫 Job errored ${job.id} - ${error}`, { error });

    Sentry.captureException(error, {
      data: {
        job: job.id,
      },
    });

    try {
      // Move job to failed state in Redis
      await job.moveToFailed(error, token, false);
    } catch (e) {
      logger.log("Failed to move job to failed state in Redis", { error });
    }

    await updateExtract(job.data.extractId, {
      status: "failed",
      error:
        error.error ??
        error ??
        "Unknown error, please contact help@firecrawl.com. Extract id: " +
          job.data.extractId,
    });
    return {
      success: false,
      error:
        error.error ??
        error ??
        "Unknown error, please contact help@firecrawl.com. Extract id: " +
          job.data.extractId,
    };
    // throw error;
  } finally {
    clearInterval(extendLockInterval);
  }
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

let cantAcceptConnectionCount = 0;

const workerFun = async (
  queue: Queue,
  processJobInternal: (token: string, job: Job) => Promise<any>,
) => {
  const logger = _logger.child({ module: "queue-worker", method: "workerFun" });

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
      cantAcceptConnectionCount++;

      if (cantAcceptConnectionCount >= 25) {
        logger.error("WORKER STALLED", {
          cpuUsage: await monitor.checkCpuUsage(),
          memoryUsage: await monitor.checkMemoryUsage(),
        });
      }

      await sleep(cantAcceptConnectionInterval); // more sleep
      continue;
    } else {
      cantAcceptConnectionCount = 0;
    }

    const job = await worker.getNextJob(token);
    if (job) {
      if (job.id) {
        runningJobs.add(job.id);
      }

      async function afterJobDone(job: Job<any, any, string>) {
        if (job.id) {
          runningJobs.delete(job.id);
        }

        if (job.id && job.data && job.data.team_id && job.data.plan) {
          await removeConcurrencyLimitActiveJob(job.data.team_id, job.id);
          cleanOldConcurrencyLimitEntries(job.data.team_id);

          // Queue up next job, if it exists
          // No need to check if we're under the limit here -- if the current job is finished,
          // we are 1 under the limit, assuming the job insertion logic never over-inserts. - MG
          const nextJob = await takeConcurrencyLimitedJob(job.data.team_id);
          if (nextJob !== null) {
            await pushConcurrencyLimitActiveJob(job.data.team_id, nextJob.id, calculateJobTimeToRun(nextJob));

            await queue.add(
              nextJob.id,
              {
                ...nextJob.data,
                concurrencyLimitHit: true,
              },
              {
                ...nextJob.opts,
                jobId: nextJob.id,
                priority: nextJob.priority,
              },
            );
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
                      await afterJobDone(job);
                    }

                    if (res !== null) {
                      span.setStatus({ code: 2 }); // ERROR
                    } else {
                      span.setStatus({ code: 1 }); // OK
                    }
                  },
                );
              },
            );
          },
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
            processJobInternal(token, job).finally(() => afterJobDone(job));
          },
        );
      }

      await sleep(gotJobInterval);
    } else {
      await sleep(connectionMonitorInterval);
    }
  }
};

async function processKickoffJob(job: Job & { id: string }, token: string) {
  const logger = _logger.child({
    module: "queue-worker",
    method: "processKickoffJob",
    jobId: job.id,
    scrapeId: job.id,
    crawlId: job.data?.crawl_id ?? undefined,
    teamId: job.data?.team_id ?? undefined,
  });

  try {
    const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;
    const crawler = crawlToCrawler(job.data.crawl_id, sc);

    logger.debug("Locking URL...");
    await lockURL(job.data.crawl_id, sc, job.data.url);
    const jobId = uuidv4();
    logger.debug("Adding scrape job to Redis...", { jobId });
    await addScrapeJob(
      {
        url: job.data.url,
        mode: "single_urls",
        team_id: job.data.team_id,
        crawlerOptions: job.data.crawlerOptions,
        scrapeOptions: scrapeOptions.parse(job.data.scrapeOptions),
        internalOptions: sc.internalOptions,
        plan: job.data.plan!,
        origin: job.data.origin,
        crawl_id: job.data.crawl_id,
        webhook: job.data.webhook,
        v1: job.data.v1,
        isCrawlSourceScrape: true,
      },
      {
        priority: 15,
      },
      jobId,
    );
    logger.debug("Adding scrape job to BullMQ...", { jobId });
    await addCrawlJob(job.data.crawl_id, jobId);

    if (job.data.webhook) {
      logger.debug("Calling webhook with crawl.started...", {
        webhook: job.data.webhook,
      });
      await callWebhook(
        job.data.team_id,
        job.data.crawl_id,
        null,
        job.data.webhook,
        true,
        "crawl.started",
      );
    }

    const sitemap = sc.crawlerOptions.ignoreSitemap
      ? 0
      : await crawler.tryGetSitemap(async (urls) => {
          if (urls.length === 0) return;

          logger.debug("Using sitemap chunk of length " + urls.length, {
            sitemapLength: urls.length,
          });

          let jobPriority = await getJobPriority({
            plan: job.data.plan,
            team_id: job.data.team_id,
            basePriority: 21,
          });
          logger.debug("Using job priority " + jobPriority, { jobPriority });

          const jobs = urls.map((url) => {
            const uuid = uuidv4();
            return {
              name: uuid,
              data: {
                url,
                mode: "single_urls" as const,
                team_id: job.data.team_id,
                plan: job.data.plan!,
                crawlerOptions: job.data.crawlerOptions,
                scrapeOptions: job.data.scrapeOptions,
                internalOptions: sc.internalOptions,
                origin: job.data.origin,
                crawl_id: job.data.crawl_id,
                sitemapped: true,
                webhook: job.data.webhook,
                v1: job.data.v1,
              },
              opts: {
                jobId: uuid,
                priority: 20,
              },
            };
          });

          logger.debug("Locking URLs...");
          const lockedIds = await lockURLsIndividually(
            job.data.crawl_id,
            sc,
            jobs.map((x) => ({ id: x.opts.jobId, url: x.data.url })),
          );
          const lockedJobs = jobs.filter((x) =>
            lockedIds.find((y) => y.id === x.opts.jobId),
          );
          logger.debug("Adding scrape jobs to Redis...");
          await addCrawlJobs(
            job.data.crawl_id,
            lockedJobs.map((x) => x.opts.jobId),
          );
          logger.debug("Adding scrape jobs to BullMQ...");
          await addScrapeJobs(lockedJobs);
        });

    if (sitemap === 0) {
      logger.debug("Sitemap not found or ignored.", {
        ignoreSitemap: sc.crawlerOptions.ignoreSitemap,
      });
    }

    logger.debug("Done queueing jobs!");

    await finishCrawlKickoff(job.data.crawl_id);
    await finishCrawlIfNeeded(job, sc);

    return { success: true };
  } catch (error) {
    logger.error("An error occurred!", { error });
    await finishCrawlKickoff(job.data.crawl_id);
    const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;
    if (sc) {
      await finishCrawlIfNeeded(job, sc);
    }
    return { success: false, error };
  }
}

async function indexJob(job: Job & { id: string }, document: Document) {
  if (
    document &&
    document.markdown &&
    job.data.team_id === process.env.BACKGROUND_INDEX_TEAM_ID!
  ) {
    // indexPage({
    //   document: document,
    //   originUrl: job.data.crawl_id
    //     ? (await getCrawl(job.data.crawl_id))?.originUrl!
    //     : document.metadata.sourceURL!,
    //   crawlId: job.data.crawl_id,
    //   teamId: job.data.team_id,
    // }).catch((error) => {
    //   _logger.error("Error indexing page", { error });
    // });
  }
}

async function processJob(job: Job & { id: string }, token: string) {
  const logger = _logger.child({
    module: "queue-worker",
    method: "processJob",
    jobId: job.id,
    scrapeId: job.id,
    crawlId: job.data?.crawl_id ?? undefined,
    teamId: job.data?.team_id ?? undefined,
  });
  logger.info(`🐂 Worker taking job ${job.id}`, { url: job.data.url });
  const start = Date.now();

  // Check if the job URL is researchhub and block it immediately
  // TODO: remove this once solve the root issue
  // if (
  //   job.data.url &&
  //   (job.data.url.includes("researchhub.com") ||
  //     job.data.url.includes("ebay.com"))
  // ) {
  //   logger.info(`🐂 Blocking job ${job.id} with URL ${job.data.url}`);
  //   const data = {
  //     success: false,
  //     document: null,
  //     project_id: job.data.project_id,
  //     error:
  //       "URL is blocked. Suspecious activity detected. Please contact help@firecrawl.com if you believe this is an error.",
  //   };
  //   return data;
  // }

  try {
    job.updateProgress({
      current: 1,
      total: 100,
      current_step: "SCRAPING",
      current_url: "",
    });

    if (job.data.crawl_id) {
      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;
      if (sc && sc.cancelled) {
        throw new Error("Parent crawl/batch scrape was cancelled");
      }
    }

    const pipeline = await Promise.race([
      startWebScraperPipeline({
        job,
        token,
      }),
      ...(job.data.scrapeOptions.timeout !== undefined
        ? [
            (async () => {
              await sleep(job.data.scrapeOptions.timeout);
              throw new Error("timeout");
            })(),
          ]
        : []),
    ]);

    if (!pipeline.success) {
      throw pipeline.error;
    }

    const end = Date.now();
    const timeTakenInSeconds = (end - start) / 1000;

    const doc = pipeline.document;

    const rawHtml = doc.rawHtml ?? "";

    if (!job.data.scrapeOptions.formats.includes("rawHtml")) {
      delete doc.rawHtml;
    }

    const data = {
      success: true,
      result: {
        links: [
          {
            content: doc,
            source: doc?.metadata?.sourceURL ?? doc?.metadata?.url ?? "",
            id: job.id,
          },
        ],
      },
      project_id: job.data.project_id,
      document: doc,
    };

    if (job.data.webhook && job.data.mode !== "crawl" && job.data.v1) {
      logger.debug("Calling webhook with success...", {
        webhook: job.data.webhook,
      });
      await callWebhook(
        job.data.team_id,
        job.data.crawl_id,
        data,
        job.data.webhook,
        job.data.v1,
        job.data.crawlerOptions !== null ? "crawl.page" : "batch_scrape.page",
        true,
      );
    }

    if (job.data.crawl_id) {
      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

      if (
        doc.metadata.url !== undefined &&
        doc.metadata.sourceURL !== undefined &&
        normalizeURL(doc.metadata.url, sc) !==
          normalizeURL(doc.metadata.sourceURL, sc) &&
        job.data.crawlerOptions !== null // only on crawls, don't care on batch scrape
      ) {
        const crawler = crawlToCrawler(job.data.crawl_id, sc);
        if (
          crawler.filterURL(doc.metadata.url, doc.metadata.sourceURL) ===
            null &&
          !job.data.isCrawlSourceScrape
        ) {
          throw new Error(
            "Redirected target URL is not allowed by crawlOptions",
          ); // TODO: make this its own error type that is ignored by error tracking
        }

        if (job.data.isCrawlSourceScrape) {
          // TODO: re-fetch sitemap for redirect target domain
          sc.originUrl = doc.metadata.url;
          await saveCrawl(job.data.crawl_id, sc);
        }

        if (isUrlBlocked(doc.metadata.url)) {
          throw new Error(BLOCKLISTED_URL_MESSAGE); // TODO: make this its own error type that is ignored by error tracking
        }

        const p1 = generateURLPermutations(normalizeURL(doc.metadata.url, sc));
        const p2 = generateURLPermutations(
          normalizeURL(doc.metadata.sourceURL, sc),
        );

        if (JSON.stringify(p1) !== JSON.stringify(p2)) {
          logger.debug(
            "Was redirected, removing old URL and locking new URL...",
            { oldUrl: doc.metadata.sourceURL, newUrl: doc.metadata.url },
          );

          // Prevent redirect target from being visited in the crawl again
          // See lockURL
          const x = await redisConnection.sadd(
            "crawl:" + job.data.crawl_id + ":visited",
            ...p1.map((x) => x.href),
          );
          const lockRes = x === p1.length;

          if (job.data.crawlerOptions !== null && !lockRes) {
            throw new RacedRedirectError();
          }
        }
      }

      logger.debug("Logging job to DB...");
      await logJob(
        {
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
        },
        true,
      );

      indexJob(job, doc);

      logger.debug("Declaring job as done...");
      await addCrawlJobDone(job.data.crawl_id, job.id, true);

      if (job.data.crawlerOptions !== null) {
        if (!sc.cancelled) {
          const crawler = crawlToCrawler(
            job.data.crawl_id,
            sc,
            doc.metadata.url ?? doc.metadata.sourceURL ?? sc.originUrl!,
          );

          const links = crawler.filterLinks(
            await crawler.extractLinksFromHTML(
              rawHtml ?? "",
              doc.metadata?.url ?? doc.metadata?.sourceURL ?? sc.originUrl!,
            ),
            Infinity,
            sc.crawlerOptions?.maxDepth ?? 10,
          );
          logger.debug("Discovered " + links.length + " links...", {
            linksLength: links.length,
          });

          for (const link of links) {
            if (await lockURL(job.data.crawl_id, sc, link)) {
              // This seems to work really welel
              const jobPriority = await getJobPriority({
                plan: sc.plan as PlanType,
                team_id: sc.team_id,
                basePriority: job.data.crawl_id ? 20 : 10,
              });
              const jobId = uuidv4();

              logger.debug(
                "Determined job priority " +
                  jobPriority +
                  " for URL " +
                  JSON.stringify(link),
                { jobPriority, url: link },
              );

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
                jobPriority,
              );

              await addCrawlJob(job.data.crawl_id, jobId);
              logger.debug("Added job for URL " + JSON.stringify(link), {
                jobPriority,
                url: link,
                newJobId: jobId,
              });
            } else {
              // TODO: removed this, ok? too many 'not useful' logs (?) Mogery!
              // logger.debug("Could not lock URL " + JSON.stringify(link), {
              //   url: link,
              // });
            }
          }
        }
      }

      await finishCrawlIfNeeded(job, sc);
    } else {
      indexJob(job, doc);
    }

    if (job.data.is_scrape !== true) {
      let creditsToBeBilled = 1; // Assuming 1 credit per document
      if (job.data.scrapeOptions.extract) {
        creditsToBeBilled = 5;
      }

      if (job.data.team_id !== process.env.BACKGROUND_INDEX_TEAM_ID!) {
        billTeam(job.data.team_id, undefined, creditsToBeBilled, logger).catch(
          (error) => {
            logger.error(
              `Failed to bill team ${job.data.team_id} for ${creditsToBeBilled} credits`,
              { error },
            );
            // Optionally, you could notify an admin or add to a retry queue here
          },
        );
      }
    }

    logger.info(`🐂 Job done ${job.id}`);
    return data;
  } catch (error) {
    if (job.data.crawl_id) {
      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

      logger.debug("Declaring job as done...");
      await addCrawlJobDone(job.data.crawl_id, job.id, false);
      await redisConnection.srem(
        "crawl:" + job.data.crawl_id + ":visited_unique",
        normalizeURL(job.data.url, sc),
      );

      await finishCrawlIfNeeded(job, sc);
    }

    const isEarlyTimeout =
      error instanceof Error && error.message === "timeout";
    const isCancelled =
      error instanceof Error &&
      error.message === "Parent crawl/batch scrape was cancelled";

    if (isEarlyTimeout) {
      logger.error(`🐂 Job timed out ${job.id}`);
    } else if (error instanceof RacedRedirectError) {
      logger.warn(`🐂 Job got redirect raced ${job.id}, silently failing`);
    } else if (isCancelled) {
      logger.warn(`🐂 Job got cancelled, silently failing`);
    } else {
      logger.error(`🐂 Job errored ${job.id} - ${error}`, { error });

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
    }

    const data = {
      success: false,
      document: null,
      project_id: job.data.project_id,
      error:
        error instanceof Error
          ? error
          : typeof error === "string"
            ? new Error(error)
            : new Error(JSON.stringify(error)),
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

    const end = Date.now();
    const timeTakenInSeconds = (end - start) / 1000;

    logger.debug("Logging job to DB...");
    await logJob(
      {
        job_id: job.id as string,
        success: false,
        message:
          typeof error === "string"
            ? error
            : (error.message ??
              "Something went wrong... Contact help@mendable.ai"),
        num_docs: 0,
        docs: [],
        time_taken: timeTakenInSeconds,
        team_id: job.data.team_id,
        mode: job.data.mode,
        url: job.data.url,
        crawlerOptions: job.data.crawlerOptions,
        scrapeOptions: job.data.scrapeOptions,
        origin: job.data.origin,
        crawl_id: job.data.crawl_id,
      },
      true,
    );
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

// Start both workers
(async () => {
  await Promise.all([
    workerFun(getScrapeQueue(), processJobInternal),
    workerFun(getExtractQueue(), processExtractJobInternal),
  ]);

  console.log("All workers exited. Waiting for all jobs to finish...");

  while (runningJobs.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("All jobs finished. Worker out!");
  process.exit(0);
})();
