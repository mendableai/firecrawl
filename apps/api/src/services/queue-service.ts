import { Queue } from "bullmq";
import { logger } from "../lib/logger";
import IORedis from "ioredis";

let scrapeQueue: Queue;

export const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

export const scrapeQueueName = "{scrapeQueue}";

export function getScrapeQueue() {
  if (!scrapeQueue) {
    scrapeQueue = new Queue(
      scrapeQueueName,
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
      },
      //   {
      //   settings: {
      //     lockDuration: 1 * 60 * 1000, // 1 minute in milliseconds,
      //     lockRenewTime: 15 * 1000, // 15 seconds in milliseconds
      //     stalledInterval: 30 * 1000,
      //     maxStalledCount: 10,
      //   },
      //   defaultJobOptions:{
      //     attempts: 5
      //   }
      // }
    );
    logger.info("Web scraper queue created");
  }
  return scrapeQueue;
}

// === REMOVED IN FAVOR OF POLLING -- NOT RELIABLE
// import { QueueEvents } from 'bullmq';
// export const scrapeQueueEvents = new QueueEvents(scrapeQueueName, { connection: redisConnection.duplicate() });
