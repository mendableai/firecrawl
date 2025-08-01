import { Queue, QueueEvents } from "bullmq";
import { logger } from "../lib/logger";
import IORedis from "ioredis";

export type QueueFunction = () => Queue<any, any, string, any, any, string>;

let scrapeQueue: Queue;
let scrapeQueueEvents: QueueEvents;
let extractQueue: Queue;
let loggingQueue: Queue;
let indexQueue: Queue;
let deepResearchQueue: Queue;
let generateLlmsTxtQueue: Queue;
let billingQueue: Queue;
let precrawlQueue: Queue;

export function createRedisConnection() {
  const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });

  connection.on("reconnecting", () => logger.warn("Redis reconnecting"));
  connection.on("error", (err) => logger.warn("Redis error", { err }));

  return connection;
}

export const redisConnection = createRedisConnection();

export const scrapeQueueName = "{scrapeQueue}";
export const extractQueueName = "{extractQueue}";
export const loggingQueueName = "{loggingQueue}";
export const indexQueueName = "{indexQueue}";
export const generateLlmsTxtQueueName = "{generateLlmsTxtQueue}";
export const deepResearchQueueName = "{deepResearchQueue}";
export const billingQueueName = "{billingQueue}";
export const precrawlQueueName = "{precrawlQueue}";

export function getScrapeQueue() {
  if (!scrapeQueue) {
    scrapeQueue = new Queue(scrapeQueueName, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // 1 hour
        },
        removeOnFail: {
          age: 3600, // 1 hour
        },
      },
    });
  }
  return scrapeQueue;
}

export function getScrapeQueueEvents() {
  if (!scrapeQueueEvents) {
    scrapeQueueEvents = new QueueEvents(scrapeQueueName, {
      connection: createRedisConnection(),
    });
  }

  return scrapeQueueEvents;
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
  }
  return extractQueue;
}

export function getGenerateLlmsTxtQueue() {
  if (!generateLlmsTxtQueue) {
    generateLlmsTxtQueue = new Queue(generateLlmsTxtQueueName, {
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
  }
  return generateLlmsTxtQueue;
}

export function getDeepResearchQueue() {
  if (!deepResearchQueue) {
    deepResearchQueue = new Queue(deepResearchQueueName, {
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
  }
  return deepResearchQueue;
}

export function getBillingQueue() {
  if (!billingQueue) {
    billingQueue = new Queue(billingQueueName, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 60, // 1 minute
        },
        removeOnFail: {
          age: 3600, // 1 hour
        },
      },
    });
  }
  return billingQueue;
}

export function getPrecrawlQueue() {
  if (!precrawlQueue) {
    precrawlQueue = new Queue(precrawlQueueName, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 60 * 60, // 1 day
        },
        removeOnFail: {
          age: 24 * 60 * 60, // 1 day
        },
      },
    });
  }
  return precrawlQueue;
}
