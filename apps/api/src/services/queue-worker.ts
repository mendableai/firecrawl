import "dotenv/config";
import "./sentry";
import * as Sentry from "@sentry/node";
import { CustomError } from "../lib/custom-error";
import {
  getScrapeQueue,
  getExtractQueue,
  getDeepResearchQueue,
  redisConnection,
  getGenerateLlmsTxtQueue,
  getBillingQueue,
} from "./queue-service";
import { startWebScraperPipeline } from "../main/runWebScraper";
import { callWebhook } from "./webhook";
import { logJob } from "./logging/log_job";
import { Job, Queue, QueueEvents } from "bullmq";
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
  finishCrawlPre,
  unPreFinishCrawl,
  finishCrawlKickoff,
  generateURLPermutations,
  getCrawl,
  getCrawlJobs,
  getDoneJobsOrderedLength,
  lockURL,
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
import { getJobs } from "..//controllers/v1/crawl-status";
import { configDotenv } from "dotenv";
import { scrapeOptions } from "../controllers/v1/types";
import {
  concurrentJobDone,
  pushConcurrencyLimitActiveJob,
} from "../lib/concurrency-limit";
import { isUrlBlocked } from "../scraper/WebScraper/utils/blocklist";
import { BLOCKLISTED_URL_MESSAGE } from "../lib/strings";
import { Document, TeamFlags } from "../controllers/v1/types";
import {
  ExtractResult,
  performExtraction,
} from "../lib/extract/extraction-service";
import { supabase_service } from "../services/supabase";
import { normalizeUrl, normalizeUrlOnlyHostname } from "../lib/canonical-url";
import { saveExtract, updateExtract } from "../lib/extract/extract-redis";
import { billTeam } from "./billing/credit_billing";
import { updateDeepResearch } from "../lib/deep-research/deep-research-redis";
import { performDeepResearch } from "../lib/deep-research/deep-research-service";
import { performGenerateLlmsTxt } from "../lib/generate-llmstxt/generate-llmstxt-service";
import { updateGeneratedLlmsTxt } from "../lib/generate-llmstxt/generate-llmstxt-redis";
import { performExtraction_F0 } from "../lib/extract/fire-0/extraction-service-f0";
import { CostTracking } from "../lib/extract/extraction-service";
import { getACUCTeam } from "../controllers/auth";
import Express from "express";
import http from "http";
import https from "https";
import { cacheableLookup } from "../scraper/scrapeURL/lib/cacheableLookup";
import { robustFetch } from "../scraper/scrapeURL/lib/fetch";
import { RateLimiterMode } from "../types";
import { calculateCreditsToBeBilled } from "../lib/scrape-billing";
import { redisEvictConnection } from "./redis";
import { generateURLSplits, queryIndexAtSplitLevel } from "./index";
import { WebCrawler } from "../scraper/WebScraper/crawler";
import type { Logger } from "winston";

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
  Number(process.env.JOB_LOCK_EXTEND_INTERVAL) || 10000;
const jobLockExtensionTime =
  Number(process.env.JOB_LOCK_EXTENSION_TIME) || 60000;

const cantAcceptConnectionInterval =
  Number(process.env.CANT_ACCEPT_CONNECTION_INTERVAL) || 2000;
const connectionMonitorInterval =
  Number(process.env.CONNECTION_MONITOR_INTERVAL) || 10;
const gotJobInterval = Number(process.env.CONNECTION_MONITOR_INTERVAL) || 20;

const runningJobs: Set<string> = new Set();

// Install cacheable lookup for all other requests
cacheableLookup.install(http.globalAgent);
cacheableLookup.install(https.globalAgent);

async function finishCrawlIfNeeded(job: Job & { id: string }, sc: StoredCrawl) {
  const logger = _logger.child({
    module: "queue-worker",
    method: "finishCrawlIfNeeded",
    jobId: job.id,
    scrapeId: job.id,
    crawlId: job.data.crawl_id,
    zeroDataRetention: sc.internalOptions.zeroDataRetention,
  });

  if (await finishCrawlPre(job.data.crawl_id, logger)) {
    logger.info("Crawl is pre-finished, checking if we need to add more jobs");
    if (
      job.data.crawlerOptions &&
      !(await redisEvictConnection.exists(
        "crawl:" + job.data.crawl_id + ":invisible_urls",
      ))
    ) {
      await redisEvictConnection.set(
        "crawl:" + job.data.crawl_id + ":invisible_urls",
        "done",
        "EX",
        60 * 60 * 24,
      );

      const sc = (await getCrawl(job.data.crawl_id))!;

      const visitedUrls = new Set(
        await redisEvictConnection.smembers(
          "crawl:" + job.data.crawl_id + ":visited_unique",
        ),
      );
      
      logger.info("Visited URLs", {
        visitedUrls: visitedUrls.size,
      });

      let lastUrls: string[] = [];
      const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
      if (useDbAuthentication && sc.scrapeOptions.formats.includes("changeTracking")) {
        lastUrls = (
          (
            await supabase_service.rpc("diff_get_last_crawl_urls", {
              i_team_id: job.data.team_id,
              i_url: sc.originUrl!,
            })
          ).data ?? []
        ).map((x) => x.url);
      }

      const lastUrlsSet = new Set(lastUrls);

      logger.info("Last URLs", {
        lastUrls: lastUrlsSet.size,
      });

      const crawler = crawlToCrawler(
        job.data.crawl_id,
        sc,
        (await getACUCTeam(job.data.team_id))?.flags ?? null,
        sc.originUrl!,
        job.data.crawlerOptions,
      );

      const univistedUrls = await crawler.filterLinks(
        Array.from(lastUrlsSet).filter((x) => !visitedUrls.has(x)),
        Infinity,
        sc.crawlerOptions.maxDepth ?? 10,
      );

      const addableJobCount =
        sc.crawlerOptions.limit === undefined
          ? Infinity
          : sc.crawlerOptions.limit -
            (await getDoneJobsOrderedLength(job.data.crawl_id));

      if (univistedUrls.links.length !== 0 && addableJobCount > 0) {
        logger.info("Adding jobs", {
          univistedUrls: univistedUrls.links.length,
          addableJobCount,
        });

        const jobs = univistedUrls.links.slice(0, addableJobCount).map((url) => {
          const uuid = uuidv4();
          return {
            name: uuid,
            data: {
              url,
              mode: "single_urls" as const,
              team_id: job.data.team_id,
              crawlerOptions: {
                ...job.data.crawlerOptions,
                urlInvisibleInCurrentCrawl: true,
              },
              scrapeOptions: job.data.scrapeOptions,
              internalOptions: sc.internalOptions,
              origin: job.data.origin,
              integration: job.data.integration,
              crawl_id: job.data.crawl_id,
              sitemapped: true,
              webhook: job.data.webhook,
              v1: job.data.v1,
              zeroDataRetention: job.data.zeroDataRetention,
            },
            opts: {
              jobId: uuid,
              priority: 20,
            },
          };
        });

        const lockedIds = await lockURLsIndividually(
          job.data.crawl_id,
          sc,
          jobs.map((x) => ({ id: x.opts.jobId, url: x.data.url })),
        );
        const lockedJobs = jobs.filter((x) =>
          lockedIds.find((y) => y.id === x.opts.jobId),
        );
        await addCrawlJobs(
          job.data.crawl_id,
          lockedJobs.map((x) => x.opts.jobId),
          logger,
        );
        await addScrapeJobs(lockedJobs);

        if (lockedJobs.length > 0) {
          logger.info("Added jobs, not going for the full finish", {
            lockedJobs: lockedJobs.length,
          });

          await unPreFinishCrawl(job.data.crawl_id);
          return;
        } else {
          logger.info("No jobs added (all discovered URLs were locked), finishing crawl");
        }
      }
    }

    logger.info("Finishing crawl");
    await finishCrawl(job.data.crawl_id, logger);

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
        integration: job.data.integration,
        zeroDataRetention: job.data.zeroDataRetention,
      }, false, job.data.internalOptions?.bypassBilling ?? false);

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
        callWebhook({
          teamId: job.data.team_id,
          crawlId: job.data.crawl_id,
          data,
          webhook: job.data.webhook,
          v1: job.data.v1,
          eventType: job.data.crawlerOptions !== null
            ? "crawl.completed"
            : "batch_scrape.completed",
        });
      }
    } else {
      const num_docs = await getDoneJobsOrderedLength(job.data.crawl_id);
      const jobStatus = sc.cancelled ? "failed" : "completed";

      let credits_billed = null;

      if (process.env.USE_DB_AUTHENTICATION === "true") {
        const creditsRpc = await supabase_service
          .rpc("credits_billed_by_crawl_id_1", {
            i_crawl_id: job.data.crawl_id,
          });

        credits_billed = creditsRpc.data?.[0]?.credits_billed ?? null;

        if (credits_billed === null) {
          logger.warn("Credits billed is null", {
            error: creditsRpc.error,
          });
        }
      }
      
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
          integration: job.data.integration,
          credits_billed,
          zeroDataRetention: job.data.zeroDataRetention,
        },
        true,
        job.data.internalOptions?.bypassBilling ?? false,
      );


      // v1 web hooks, call when done with no data, but with event completed
      if (job.data.v1 && job.data.webhook) {
        callWebhook({
          teamId: job.data.team_id,
          crawlId: job.data.crawl_id,
          data: [],
          webhook: job.data.webhook,
          v1: job.data.v1,
          eventType: job.data.crawlerOptions !== null
            ? "crawl.completed"
            : "batch_scrape.completed",
        });
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
    zeroDataRetention: job.data?.zeroDataRetention ?? false,
  });

  const extendLockInterval = setInterval(async () => {
    logger.info(`🐂 Worker extending lock on job ${job.id}`, {
      extendInterval: jobLockExtendInterval,
      extensionTime: jobLockExtensionTime,
    });

    if (job.data?.mode !== "kickoff" && job.data?.team_id) {
      await pushConcurrencyLimitActiveJob(job.data.team_id, job.id, 60 * 1000); // 60s lock renew, just like in the queue
    }

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
            process.env.USE_DB_AUTHENTICATION === "true" &&
            (job.data.crawl_id || process.env.GCS_BUCKET_NAME)
          ) {
            logger.debug(
              "Job succeeded -- putting null in Redis",
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
    let result: ExtractResult | null = null;

    const model = job.data.request.agent?.model
    if (job.data.request.agent && model && model.toLowerCase().includes("fire-1")) {
      result = await performExtraction(job.data.extractId, {
        request: job.data.request,
        teamId: job.data.teamId,
        subId: job.data.subId,
      });
    } else {
      result = await performExtraction_F0(job.data.extractId, {
        request: job.data.request,
        teamId: job.data.teamId,
        subId: job.data.subId,
      });
    }
    // result = await performExtraction_F0(job.data.extractId, {
    //   request: job.data.request,
    //   teamId: job.data.teamId,
    //   subId: job.data.subId,
    // });

    if (result && result.success) {
      // Move job to completed state in Redis
      await job.moveToCompleted(result, token, false);
      return result;
    } else {
      // throw new Error(result.error || "Unknown error during extraction");

      await job.moveToCompleted(result, token, false);
      await updateExtract(job.data.extractId, {
        status: "failed",
        error:
          result?.error ??
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

const processDeepResearchJobInternal = async (
  token: string,
  job: Job & { id: string },
) => {
  const logger = _logger.child({
    module: "deep-research-worker",
    method: "processJobInternal",
    jobId: job.id,
    researchId: job.data.researchId,
    teamId: job.data?.teamId ?? undefined,
  });

  const extendLockInterval = setInterval(async () => {
    logger.info(`🔄 Worker extending lock on job ${job.id}`);
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  try {
    console.log(
      "[Deep Research] Starting deep research: ",
      job.data.researchId,
    );
    const result = await performDeepResearch({
      researchId: job.data.researchId,
      teamId: job.data.teamId,
      query: job.data.request.query,
      maxDepth: job.data.request.maxDepth,
      timeLimit: job.data.request.timeLimit,
      subId: job.data.subId,
      maxUrls: job.data.request.maxUrls,
      analysisPrompt: job.data.request.analysisPrompt,
      systemPrompt: job.data.request.systemPrompt,
      formats: job.data.request.formats,
      jsonOptions: job.data.request.jsonOptions,
    });

    if (result.success) {
      // Move job to completed state in Redis and update research status
      await job.moveToCompleted(result, token, false);
      return result;
    } else {
      // If the deep research failed but didn't throw an error
      const error = new Error("Deep research failed without specific error");
      await updateDeepResearch(job.data.researchId, {
        status: "failed",
        error: error.message,
      });
      await job.moveToFailed(error, token, false);

      return { success: false, error: error.message };
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
      logger.error("Failed to move job to failed state in Redis", { error });
    }

    await updateDeepResearch(job.data.researchId, {
      status: "failed",
      error: error.message || "Unknown error occurred",
    });

    return { success: false, error: error.message || "Unknown error occurred" };
  } finally {
    clearInterval(extendLockInterval);
  }
};

const processGenerateLlmsTxtJobInternal = async (
  token: string,
  job: Job & { id: string },
) => {
  const logger = _logger.child({
    module: "generate-llmstxt-worker",
    method: "processJobInternal",
    jobId: job.id,
    generateId: job.data.generateId,
    teamId: job.data?.teamId ?? undefined,
  });

  const extendLockInterval = setInterval(async () => {
    logger.info(`🔄 Worker extending lock on job ${job.id}`);
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  try {
    const result = await performGenerateLlmsTxt({
      generationId: job.data.generationId,
      teamId: job.data.teamId,
      url: job.data.request.url,
      maxUrls: job.data.request.maxUrls,
      showFullText: job.data.request.showFullText,
      subId: job.data.subId,
      cache: job.data.request.cache,
    });

    if (result.success) {
      await job.moveToCompleted(result, token, false);
      await updateGeneratedLlmsTxt(job.data.generateId, {
        status: "completed",
        generatedText: result.data.generatedText,
        fullText: result.data.fullText,
      });
      return result;
    } else {
      const error = new Error(
        "LLMs text generation failed without specific error",
      );
      await job.moveToFailed(error, token, false);
      await updateGeneratedLlmsTxt(job.data.generateId, {
        status: "failed",
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  } catch (error) {
    logger.error(`🚫 Job errored ${job.id} - ${error}`, { error });

    Sentry.captureException(error, {
      data: {
        job: job.id,
      },
    });

    try {
      await job.moveToFailed(error, token, false);
    } catch (e) {
      logger.error("Failed to move job to failed state in Redis", { error });
    }

    await updateGeneratedLlmsTxt(job.data.generateId, {
      status: "failed",
      error: error.message || "Unknown error occurred",
    });

    return { success: false, error: error.message || "Unknown error occurred" };
  } finally {
    clearInterval(extendLockInterval);
  }
};

let isShuttingDown = false;
let isWorkerStalled = false;

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
    lockDuration: 30 * 1000, // 30 seconds
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
      console.log("Can't accept connection due to RAM/CPU load");
      logger.info("Can't accept connection due to RAM/CPU load");
      cantAcceptConnectionCount++;

      isWorkerStalled = cantAcceptConnectionCount >= 25;

      if (isWorkerStalled) {
        logger.error("WORKER STALLED", {
          cpuUsage: await monitor.checkCpuUsage(),
          memoryUsage: await monitor.checkMemoryUsage(),
        });
      }

      await sleep(cantAcceptConnectionInterval); // more sleep
      continue;
    } else if (!currentLiveness) {
      logger.info("Not accepting jobs because the liveness check failed");

      await sleep(cantAcceptConnectionInterval);
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
        try {
          await concurrentJobDone(job);
        } finally {
          if (job.id) {
            runningJobs.delete(job.id);
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

async function kickoffGetIndexLinks(sc: StoredCrawl, crawler: WebCrawler, url: string) {
  if (sc.crawlerOptions.ignoreSitemap) {
    return [];
  }

  const trimmedURL = new URL(url);
  trimmedURL.search = "";

  const index = await queryIndexAtSplitLevel(
    sc.crawlerOptions.allowBackwardCrawling ? generateURLSplits(trimmedURL.href)[0] : trimmedURL.href,
    sc.crawlerOptions.limit ?? 10000,
  );

  const validIndexLinksResult = await crawler.filterLinks(
    index.filter(x => crawler.filterURL(x, trimmedURL.href).allowed),
    sc.crawlerOptions.limit ?? 10000,
    sc.crawlerOptions.maxDepth ?? 10,
    false,
  );
  const validIndexLinks = validIndexLinksResult.links;

  return validIndexLinks;
}

async function processKickoffJob(job: Job & { id: string }, token: string) {
  const logger = _logger.child({
    module: "queue-worker",
    method: "processKickoffJob",
    jobId: job.id,
    scrapeId: job.id,
    crawlId: job.data?.crawl_id ?? undefined,
    teamId: job.data?.team_id ?? undefined,
    zeroDataRetention: job.data.zeroDataRetention ?? false,
  });

  try {
    const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;
    const crawler = crawlToCrawler(job.data.crawl_id, sc, (await getACUCTeam(job.data.team_id))?.flags ?? null);

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
        origin: job.data.origin,
        integration: job.data.integration,
        crawl_id: job.data.crawl_id,
        webhook: job.data.webhook,
        v1: job.data.v1,
        isCrawlSourceScrape: true,
        zeroDataRetention: job.data.zeroDataRetention,
      },
      {
        priority: 15,
      },
      jobId,
    );
    logger.debug("Adding scrape job to BullMQ...", { jobId });
    await addCrawlJob(job.data.crawl_id, jobId, logger);

    if (job.data.webhook) {
      logger.debug("Calling webhook with crawl.started...", {
        webhook: job.data.webhook,
      });
      callWebhook({
        teamId: job.data.team_id,
        crawlId: job.data.crawl_id,
        data: null,
        webhook: job.data.webhook,
        v1: job.data.v1,
        eventType: "crawl.started",
      });
    }

    const sitemap = sc.crawlerOptions.ignoreSitemap
      ? 0
      : await crawler.tryGetSitemap(async (urls) => {
          if (urls.length === 0) return;

          logger.debug("Using sitemap chunk of length " + urls.length, {
            sitemapLength: urls.length,
          });

          let jobPriority = await getJobPriority({
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
                crawlerOptions: job.data.crawlerOptions,
                scrapeOptions: job.data.scrapeOptions,
                internalOptions: sc.internalOptions,
                origin: job.data.origin,
                integration: job.data.integration,
                crawl_id: job.data.crawl_id,
                sitemapped: true,
                webhook: job.data.webhook,
                v1: job.data.v1,
                zeroDataRetention: job.data.zeroDataRetention,
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
            logger,
          );
          logger.debug("Adding scrape jobs to BullMQ...");
          await addScrapeJobs(lockedJobs);
        });

    if (sitemap === 0) {
      logger.debug("Sitemap not found or ignored.", {
        ignoreSitemap: sc.crawlerOptions.ignoreSitemap,
      });
    }

    const indexLinks = await kickoffGetIndexLinks(sc, crawler, job.data.url);

    if (indexLinks.length > 0) {
      logger.debug("Using index links of length " + indexLinks.length, {
        indexLinksLength: indexLinks.length,
      });

      let jobPriority = await getJobPriority({
        team_id: job.data.team_id,
        basePriority: 21,
      });
      logger.debug("Using job priority " + jobPriority, { jobPriority });

      const jobs = indexLinks.map((url) => {
        const uuid = uuidv4();
        return {
          name: uuid,
          data: {
            url,
            mode: "single_urls" as const,
            team_id: job.data.team_id,
            crawlerOptions: job.data.crawlerOptions,
            scrapeOptions: job.data.scrapeOptions,
            internalOptions: sc.internalOptions,
            origin: job.data.origin,
            integration: job.data.integration,
            crawl_id: job.data.crawl_id,
            sitemapped: true,
            webhook: job.data.webhook,
            v1: job.data.v1,
            zeroDataRetention: job.data.zeroDataRetention,
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
        logger,
      );
      logger.debug("Adding scrape jobs to BullMQ...");
      await addScrapeJobs(lockedJobs);
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

async function billScrapeJob(job: Job & { id: string }, document: Document | null, logger: Logger, costTracking: CostTracking, flags: TeamFlags) {
  let creditsToBeBilled: number | null = null;

  if (job.data.is_scrape !== true && !job.data.internalOptions?.bypassBilling) {
    creditsToBeBilled = await calculateCreditsToBeBilled(job.data.scrapeOptions, job.data.internalOptions, document, costTracking, flags);

    if (
      job.data.team_id !== process.env.BACKGROUND_INDEX_TEAM_ID! &&
      process.env.USE_DB_AUTHENTICATION === "true"
    ) {
      try {
        const billingJobId = uuidv4();
        logger.debug(
          `Adding billing job to queue for team ${job.data.team_id}`,
          {
            billingJobId,
            credits: creditsToBeBilled,
            is_extract: false,
          },
        );

        // Add directly to the billing queue - the billing worker will handle the rest
        await getBillingQueue().add(
          "bill_team",
          {
            team_id: job.data.team_id,
            subscription_id: undefined,
            credits: creditsToBeBilled,
            is_extract: false,
            timestamp: new Date().toISOString(),
            originating_job_id: job.id,
          },
          {
            jobId: billingJobId,
            priority: 10,
          },
        );

        return creditsToBeBilled;
      } catch (error) {
        logger.error(
          `Failed to add billing job to queue for team ${job.data.team_id} for ${creditsToBeBilled} credits`,
          { error },
        );
        Sentry.captureException(error);
        return creditsToBeBilled;
      }
    }
  }

  return creditsToBeBilled;
}

async function processJob(job: Job & { id: string }, token: string) {
  const logger = _logger.child({
    module: "queue-worker",
    method: "processJob",
    jobId: job.id,
    scrapeId: job.id,
    crawlId: job.data?.crawl_id ?? undefined,
    teamId: job.data?.team_id ?? undefined,
    zeroDataRetention: job.data?.zeroDataRetention ?? false,
  });
  logger.info(`🐂 Worker taking job ${job.id}`, { url: job.data.url });
  const start = job.data.startTime ?? Date.now();
  const remainingTime = job.data.scrapeOptions.timeout ? (job.data.scrapeOptions.timeout - (Date.now() - start)) : undefined;

  const costTracking = new CostTracking();

  try {
    job.updateProgress({
      current: 1,
      total: 100,
      current_step: "SCRAPING",
      current_url: "",
    });

    if (remainingTime !== undefined && remainingTime < 0) {
      throw new Error("timeout");
    }
    const signal = remainingTime ? AbortSignal.timeout(remainingTime) : undefined;

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
        costTracking,
      }),
      ...(remainingTime !== undefined
        ? [
            (async () => {
              await sleep(remainingTime);
              throw new Error("timeout");
            })(),
          ]
        : []),
    ]);

    try {
      signal?.throwIfAborted();
    } catch (e) {
      throw new Error("timeout");
    }

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

    if (job.data.concurrencyLimited) {
      doc.warning =
        "This scrape job was throttled at your current concurrency limit. If you'd like to scrape faster, you can upgrade your plan." +
        (doc.warning ? " " + doc.warning : "");
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

    if (job.data.crawl_id) {
      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

      if (
        doc.metadata.url !== undefined &&
        doc.metadata.sourceURL !== undefined &&
        normalizeURL(doc.metadata.url, sc) !==
          normalizeURL(doc.metadata.sourceURL, sc) &&
        job.data.crawlerOptions !== null // only on crawls, don't care on batch scrape
      ) {
        const crawler = crawlToCrawler(job.data.crawl_id, sc, (await getACUCTeam(job.data.team_id))?.flags ?? null);
        const filterResult = crawler.filterURL(doc.metadata.url, doc.metadata.sourceURL);
        if (!filterResult.allowed && !job.data.isCrawlSourceScrape) {
          const reason = filterResult.denialReason || "Redirected target URL is not allowed by crawlOptions";
          throw new Error(reason);
        }

        // Only re-set originUrl if it's different from the current hostname
        // This is only done on this condition to handle cross-domain redirects
        // If this would be done for non-crossdomain redirects, but also for e.g.
        // redirecting / -> /introduction (like our docs site does), it would
        // break crawling the entire site without allowBackwardsCrawling - mogery
        const isHostnameDifferent =
          normalizeUrlOnlyHostname(doc.metadata.url) !==
          normalizeUrlOnlyHostname(doc.metadata.sourceURL);
        if (job.data.isCrawlSourceScrape && isHostnameDifferent) {
          // TODO: re-fetch sitemap for redirect target domain
          sc.originUrl = doc.metadata.url;
          await saveCrawl(job.data.crawl_id, sc);
        }

        if (isUrlBlocked(doc.metadata.url, (await getACUCTeam(job.data.team_id))?.flags ?? null)) {
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
          const x = await redisEvictConnection.sadd(
            "crawl:" + job.data.crawl_id + ":visited",
            ...p1.map((x) => x.href),
          );
          const lockRes = x === p1.length;

          if (job.data.crawlerOptions !== null && !lockRes) {
            throw new RacedRedirectError();
          }
        }
      }

      if (job.data.crawlerOptions !== null) {
        if (!sc.cancelled) {
          const crawler = crawlToCrawler(
            job.data.crawl_id,
            sc,
            (await getACUCTeam(job.data.team_id))?.flags ?? null,
            doc.metadata.url ?? doc.metadata.sourceURL ?? sc.originUrl!,
            job.data.crawlerOptions,
          );

          const links = await crawler.filterLinks(
            await crawler.extractLinksFromHTML(
              rawHtml ?? "",
              doc.metadata?.url ?? doc.metadata?.sourceURL ?? sc.originUrl!,
            ),
            Infinity,
            sc.crawlerOptions?.maxDepth ?? 10,
          );
          logger.debug("Discovered " + links.links.length + " links...", {
            linksLength: links.links.length,
          });

          for (const link of links.links) {
            if (await lockURL(job.data.crawl_id, sc, link)) {
              // This seems to work really welel
              const jobPriority = await getJobPriority({
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
                  crawlerOptions: {
                    ...sc.crawlerOptions,
                    currentDiscoveryDepth:
                      (job.data.crawlerOptions?.currentDiscoveryDepth ?? 0) + 1,
                  },
                  origin: job.data.origin,
                  integration: job.data.integration,
                  crawl_id: job.data.crawl_id,
                  webhook: job.data.webhook,
                  v1: job.data.v1,
                  zeroDataRetention: job.data.zeroDataRetention,
                },
                {},
                jobId,
                jobPriority,
              );

              await addCrawlJob(job.data.crawl_id, jobId, logger);
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

          // Only run check after adding new jobs for discovery - mogery
          if (job.data.isCrawlSourceScrape) {
            const filterResult = await crawler.filterLinks(
              [doc.metadata.url ?? doc.metadata.sourceURL!],
              1,
              sc.crawlerOptions?.maxDepth ?? 10,
            );
            if (filterResult.links.length === 0) {
              const url = doc.metadata.url ?? doc.metadata.sourceURL!;
              const reason = filterResult.denialReasons.get(url) || "Source URL is not allowed by crawl configuration";
              throw new Error(reason);
            }
          }
        }
      }

      try {
        signal?.throwIfAborted();
      } catch (e) {
        throw new Error("timeout");
      }

      const credits_billed = await billScrapeJob(job, doc, logger, costTracking, (await getACUCTeam(job.data.team_id))?.flags ?? null);

      doc.metadata.creditsUsed = credits_billed ?? undefined;

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
          integration: job.data.integration,
          crawl_id: job.data.crawl_id,
          cost_tracking: costTracking,
          pdf_num_pages: doc.metadata.numPages,
          credits_billed,
          change_tracking_tag: job.data.scrapeOptions.changeTrackingOptions?.tag ?? null,
          zeroDataRetention: job.data.zeroDataRetention,
        },
        true,
        job.data.internalOptions?.bypassBilling ?? false,
      );

      if (job.data.webhook && job.data.mode !== "crawl" && job.data.v1) {
        logger.debug("Calling webhook with success...", {
          webhook: job.data.webhook,
        });
        callWebhook({
          teamId: job.data.team_id,
          crawlId: job.data.crawl_id,
          scrapeId: job.id,
          data,
          webhook: job.data.webhook,
          v1: job.data.v1,
          eventType: job.data.crawlerOptions !== null ? "crawl.page" : "batch_scrape.page",
        });
      }

      logger.debug("Declaring job as done...");
      await addCrawlJobDone(job.data.crawl_id, job.id, true, logger);

      await finishCrawlIfNeeded(job, sc);
    } else {
      try {
        signal?.throwIfAborted();
      } catch (e) {
        throw new Error("timeout");
      }

      const credits_billed = await billScrapeJob(job, doc, logger, costTracking, (await getACUCTeam(job.data.team_id))?.flags ?? null);

      doc.metadata.creditsUsed = credits_billed ?? undefined;

      await logJob({
        job_id: job.id,
        success: true,
        message: "Scrape completed",
        num_docs: 1,
        docs: [doc],
        time_taken: timeTakenInSeconds,
        team_id: job.data.team_id,
        mode: "scrape",
        url: job.data.url,
        scrapeOptions: job.data.scrapeOptions,
        origin: job.data.origin,
        integration: job.data.integration,
        num_tokens: 0, // TODO: fix
        cost_tracking: costTracking,
        pdf_num_pages: doc.metadata.numPages,
        credits_billed,
        change_tracking_tag: job.data.scrapeOptions.changeTrackingOptions?.tag ?? null,
        zeroDataRetention: job.data.zeroDataRetention,
      }, false, job.data.internalOptions?.bypassBilling ?? false);
    }

    logger.info(`🐂 Job done ${job.id}`);
    return data;
  } catch (error) {
    if (job.data.crawl_id) {
      const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

      logger.debug("Declaring job as done...");
      await addCrawlJobDone(job.data.crawl_id, job.id, false, logger);
      await redisEvictConnection.srem(
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
      callWebhook({
        teamId: job.data.team_id,
        crawlId: job.data.crawl_id ?? (job.id as string),
        scrapeId: job.id,
        data,
        webhook: job.data.webhook,
        v1: job.data.v1,
        eventType: job.data.crawlerOptions !== null ? "crawl.page" : "batch_scrape.page",
      });
    }

    const end = Date.now();
    const timeTakenInSeconds = (end - start) / 1000;

    const credits_billed = await billScrapeJob(job, null, logger, costTracking, (await getACUCTeam(job.data.team_id))?.flags ?? null);

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
        integration: job.data.integration,
        crawl_id: job.data.crawl_id,
        cost_tracking: costTracking,
        credits_billed,
        zeroDataRetention: job.data.zeroDataRetention,
      },
      true,
      job.data.internalOptions?.bypassBilling ?? false,
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

// Start all workers
const app = Express();

let currentLiveness: boolean = true;

app.get("/liveness", (req, res) => {
  // stalled check
  if (isWorkerStalled) {
    currentLiveness = false;
    res.status(500).json({ ok: false });
  } else {
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      // networking check for Kubernetes environments
      const host = process.env.FIRECRAWL_APP_HOST || "firecrawl-app-service";
      const port = process.env.FIRECRAWL_APP_PORT || "3002";
      const scheme = process.env.FIRECRAWL_APP_SCHEME || "http";
      
      robustFetch({
        url: `${scheme}://${host}:${port}`,
        method: "GET",
        mock: null,
        logger: _logger,
        abort: AbortSignal.timeout(5000),
        ignoreResponse: true,
      })
        .then(() => {
          currentLiveness = true;
          res.status(200).json({ ok: true });
        }).catch(e => {
          _logger.error("WORKER NETWORKING CHECK FAILED", { error: e });
          currentLiveness = false;
          res.status(500).json({ ok: false });
        });
    } else {
      currentLiveness = true;
      res.status(200).json({ ok: true });
    }
  }
});

const workerPort = process.env.PORT || 3005;
app.listen(workerPort, () => {
  _logger.info(`Liveness endpoint is running on port ${workerPort}`);
});

(async () => {
  async function failedListener(args: { jobId: string; failedReason: string; prev?: string | undefined; }) {
    if (args.failedReason === "job stalled more than allowable limit") {
      const set = await redisEvictConnection.set("stalled-job-cleaner:" + args.jobId, "1", "EX", 60 * 60 * 24, "NX");
      if (!set) {
        return;
      }

      const job = await getScrapeQueue().getJob(args.jobId);
      let logger = _logger.child({ jobId: args.jobId, scrapeId: args.jobId, module: "queue-worker", method: "failedListener", zeroDataRetention: job?.data.zeroDataRetention });
      if (job && job.data.crawl_id) {
        logger = logger.child({ crawlId: job.data.crawl_id });
        logger.warn("Job stalled more than allowable limit");

        const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;

        if (job.mode === "kickoff") {
          await finishCrawlKickoff(job.data.crawl_id);
          if (sc) {
            await finishCrawlIfNeeded(job, sc);
          }
        } else {
          const sc = (await getCrawl(job.data.crawl_id)) as StoredCrawl;
  
          logger.debug("Declaring job as done...");
          await addCrawlJobDone(job.data.crawl_id, job.id, false, logger);
          await redisEvictConnection.srem(
            "crawl:" + job.data.crawl_id + ":visited_unique",
            normalizeURL(job.data.url, sc),
          );
    
          await finishCrawlIfNeeded(job, sc);
        }
      } else {
        logger.warn("Job stalled more than allowable limit");
      }
    }
  }

  const scrapeQueueEvents = new QueueEvents(getScrapeQueue().name, { connection: redisConnection });
  scrapeQueueEvents.on("failed", failedListener);

  await Promise.all([
    workerFun(getScrapeQueue(), processJobInternal),
    workerFun(getExtractQueue(), processExtractJobInternal),
    workerFun(getDeepResearchQueue(), processDeepResearchJobInternal),
    workerFun(getGenerateLlmsTxtQueue(), processGenerateLlmsTxtJobInternal),
  ]);

  console.log("All workers exited. Waiting for all jobs to finish...");

  while (runningJobs.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await scrapeQueueEvents.close();
  console.log("All jobs finished. Worker out!");
  process.exit(0);
})();