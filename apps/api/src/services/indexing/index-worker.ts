import "dotenv/config";
import "../sentry";
import * as Sentry from "@sentry/node";
import { Job, Queue, Worker } from "bullmq";
import { logger as _logger, logger } from "../../lib/logger";
import {
  redisConnection,
  indexQueueName,
  getIndexQueue,
} from "../queue-service";
import { saveCrawlMap } from "./crawl-maps-index";
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

const workerFun = async (queue: Queue) => {
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
      logger.info("Cant accept connection");
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
                await processJobInternal(token, job);
              },
            );
          },
        );
      } else {
        await processJobInternal(token, job);
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

// Start the worker
(async () => {
  await workerFun(getIndexQueue());
})();
