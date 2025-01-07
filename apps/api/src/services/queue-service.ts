import { Queue } from "bullmq";
import { logger } from "../lib/logger";
import IORedis from "ioredis";

let mainQueue: Queue;
let loggingQueue: Queue;

export const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const mainQueueName = "{mainQueue}";
export const loggingQueueName = "{loggingQueue}";

export function getMainQueue() {
  if (!mainQueue) {
    mainQueue = new Queue(
      mainQueueName,
      {
        connection: redisConnection,
        defaultJobOptions: {
          removeOnComplete: {
            age: 90000, // 25 hours
          },
          removeOnFail: {
            age: 90000, // 25 hours
          },
        },
      }
    );
    logger.info("Main queue created");
  }
  return mainQueue;
}

export function getLoggingQueue() {
  if (!loggingQueue) {
    loggingQueue = new Queue(loggingQueueName, {
      connection: redisConnection,
    });
    logger.info("Logging queue created");
  }
  return loggingQueue;
}

// Backwards compatibility exports
export const getScrapeQueue = getMainQueue;
export const getExtractQueue = getMainQueue;
