import { Queue } from "bullmq";
import { logger } from "../lib/logger";
import IORedis from "ioredis";

let scrapeQueue: Queue;
let extractQueue: Queue;
let loggingQueue: Queue;

export const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const scrapeQueueName = "{scrapeQueue}";
export const extractQueueName = "{extractQueue}";
export const loggingQueueName = "{loggingQueue}";

export function getScrapeQueue() {
  if (!scrapeQueue) {
    scrapeQueue = new Queue(scrapeQueueName, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 90000, // 25 hours
        },
        removeOnFail: {
          age: 90000, // 25 hours
        },
      },
    });
    logger.info("Web scraper queue created");
  }
  return scrapeQueue;
}

export function getExtractQueue() {
  if (!extractQueue) {
    extractQueue = new Queue(extractQueueName, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 90000, // 25 hours
        },
        removeOnFail: {
          age: 90000, // 25 hours
        },
      },
    });
    logger.info("Extraction queue created");
  }
  return extractQueue;
}

// === REMOVED IN FAVOR OF POLLING -- NOT RELIABLE
// import { QueueEvents } from 'bullmq';
// export const scrapeQueueEvents = new QueueEvents(scrapeQueueName, { connection: redisConnection.duplicate() });
