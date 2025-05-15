import "dotenv/config";
import "../sentry";
import * as Sentry from "@sentry/node";
import { Job, Queue, Worker } from "bullmq";
import { logger as _logger, logger } from "../../lib/logger";
import {
  redisConnection,
  indexQueueName,
  getIndexQueue,
  billingQueueName,
  getBillingQueue,
} from "../queue-service";
import { saveCrawlMap } from "./crawl-maps-index";
import { processBillingBatch, queueBillingOperation, startBillingBatchProcessing } from "../billing/batch_billing";
import systemMonitor from "../system-monitor";
import { v4 as uuidv4 } from "uuid";

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

const processJobInternal = async (token: string, job: Job) => {
  if (!job.id) {
    throw new Error("Job has no ID");
  }

  const logger = _logger.child({
    module: "index-worker",
    method: "processJobInternal",
    jobId: job.id,
  });

  const extendLockInterval = setInterval(async () => {
    logger.info(`🔄 Worker extending lock on job ${job.id}`);
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  let err = null;
  try {
    const { originUrl, visitedUrls } = job.data;
    await saveCrawlMap(originUrl, visitedUrls);
    await job.moveToCompleted({ success: true }, token, false);
  } catch (error) {
    logger.error("Error processing index job", { error });
    Sentry.captureException(error);
    err = error;
    await job.moveToFailed(error, token, false);
  } finally {
    clearInterval(extendLockInterval);
  }

  return err;
};

// Create a processor for billing jobs
const processBillingJobInternal = async (token: string, job: Job) => {
  if (!job.id) {
    throw new Error("Job has no ID");
  }

  const logger = _logger.child({
    module: "billing-worker",
    method: "processBillingJobInternal",
    jobId: job.id,
  });

  const extendLockInterval = setInterval(async () => {
    logger.info(`🔄 Worker extending lock on billing job ${job.id}`);
    await job.extendLock(token, jobLockExtensionTime);
  }, jobLockExtendInterval);

  let err = null;
  try {
    // Check job type - it could be either a batch processing trigger or an individual billing operation
    if (job.name === "process-batch") {
      // Process the entire batch
      logger.info("Received batch process trigger job");
      await processBillingBatch();
    } else if (job.name === "bill_team") {
      // This is an individual billing operation that should be queued for batch processing
      const { team_id, subscription_id, credits, is_extract } = job.data;
      
      logger.info(`Adding team ${team_id} billing operation to batch queue`, {
        credits,
        is_extract,
        originating_job_id: job.data.originating_job_id,
      });
      
      // Add to the REDIS batch queue 
      await queueBillingOperation(team_id, subscription_id, credits, is_extract);
    } else {
      logger.warn(`Unknown billing job type: ${job.name}`);
    }
    
    await job.moveToCompleted({ success: true }, token, false);
  } catch (error) {
    logger.error("Error processing billing job", { error });
    Sentry.captureException(error);
    err = error;
    await job.moveToFailed(error, token, false);
  } finally {
    clearInterval(extendLockInterval);
  }

  return err;
};

let isShuttingDown = false;

process.on("SIGINT", () => {
  logger.info("Received SIGTERM. Shutting down gracefully...");
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM. Shutting down gracefully...");
  isShuttingDown = true;
});

let cantAcceptConnectionCount = 0;

// Generic worker function that can process different job types
const workerFun = async (queue: Queue, jobProcessor: (token: string, job: Job) => Promise<any>) => {
  const logger = _logger.child({ module: "index-worker", method: "workerFun" });

  const worker = new Worker(queue.name, null, {
    connection: redisConnection,
    lockDuration: workerLockDuration,
    stalledInterval: workerStalledCheckInterval,
    maxStalledCount: 10,
  });

  worker.startStalledCheckTimer();

  const monitor = await systemMonitor;

  while (true) {
    if (isShuttingDown) {
      logger.info("No longer accepting new jobs. SIGINT");
      break;
    }

    const token = uuidv4();
    const canAcceptConnection = await monitor.acceptConnection();

    if (!canAcceptConnection) {
      console.log("Can't accept connection due to RAM/CPU load");
      logger.info("Can't accept connection due to RAM/CPU load");
      cantAcceptConnectionCount++;

      if (cantAcceptConnectionCount >= 25) {
        logger.error("WORKER STALLED", {
          cpuUsage: await monitor.checkCpuUsage(),
          memoryUsage: await monitor.checkMemoryUsage(),
        });
      }

      await new Promise((resolve) =>
        setTimeout(resolve, cantAcceptConnectionInterval),
      );
      continue;
    } else {
      cantAcceptConnectionCount = 0;
    }

    const job = await worker.getNextJob(token);
    if (job) {
      if (job.id) {
        runningJobs.add(job.id);
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
                name: "Index job",
                attributes: {
                  job: job.id,
                  worker: process.env.FLY_MACHINE_ID ?? worker.id,
                },
              },
              async () => {
                await jobProcessor(token, job);
              },
            );
          },
        );
      } else {
        await jobProcessor(token, job);
      }

      if (job.id) {
        runningJobs.delete(job.id);
      }

      await new Promise((resolve) => setTimeout(resolve, gotJobInterval));
    } else {
      await new Promise((resolve) =>
        setTimeout(resolve, connectionMonitorInterval),
      );
    }
  }

  logger.info("Worker loop ended. Waiting for running jobs to finish...");
  while (runningJobs.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  logger.info("All jobs finished. Worker exiting!");
  process.exit(0);
};

// Start the workers
(async () => {
  // Start index worker
  const indexWorkerPromise = workerFun(getIndexQueue(), processJobInternal);
  
  // Start billing worker and batch processing
  startBillingBatchProcessing();
  const billingWorkerPromise = workerFun(getBillingQueue(), processBillingJobInternal);
  
  // Wait for both workers to complete (which should only happen on shutdown)
  await Promise.all([indexWorkerPromise, billingWorkerPromise]);
})();
