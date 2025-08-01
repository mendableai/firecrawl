import { Queue, QueueEvents } from "bullmq";
import { logger } from "../lib/logger";
import IORedis from "ioredis";

export type QueueFunction = () => Queue<any, any, string, any, any, string>;

let scrapeQueues: Queue[] = [];
let scrapeQueueEvents: QueueEvents[] = [];
let extractQueue: Queue;
let deepResearchQueue: Queue;
let generateLlmsTxtQueue: Queue;
let billingQueue: Queue;
let precrawlQueue: Queue;

export const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null
});

redisConnection.on("reconnecting", () => logger.warn("Redis reconnecting"));
redisConnection.on("error", (err) => logger.warn("Redis error", { err }));

export const extractQueueName = "{extractQueue}";
export const loggingQueueName = "{loggingQueue}";
export const indexQueueName = "{indexQueue}";
export const generateLlmsTxtQueueName = "{generateLlmsTxtQueue}";
export const deepResearchQueueName = "{deepResearchQueue}";
export const billingQueueName = "{billingQueue}";
export const precrawlQueueName = "{precrawlQueue}";

// Length of this array must evenly divide 16.
export const scrapeQueueNames = [
  "{scrapeQueue0}",
  "{scrapeQueue1}",
  "{scrapeQueue2}",
  "{scrapeQueue3}",
  "{scrapeQueue4}",
  "{scrapeQueue5}",
  "{scrapeQueue6}",
  "{scrapeQueue7}",
  "{scrapeQueue8}",
  "{scrapeQueue9}",
  "{scrapeQueue10}",
  "{scrapeQueue11}",
  "{scrapeQueue12}",
  "{scrapeQueue13}",
  "{scrapeQueue14}",
  "{scrapeQueue15}",
];

export function uuidToQueueNo(id: string) {
  return parseInt(id[0], 16) % scrapeQueueNames.length;
}

export function getScrapeQueue(i: number) {
  if (!scrapeQueues[i]) {
    scrapeQueues[i] = new Queue(scrapeQueueNames[i], {
      connection: redisConnection,
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
  return scrapeQueues[i];
}

export function getScrapeQueueEvents(i: number) {
  if (!scrapeQueueEvents[i]) {
    scrapeQueueEvents[i] = new QueueEvents(scrapeQueueNames[i], {
      connection: new IORedis(process.env.REDIS_URL!, {
        maxRetriesPerRequest: null,
      }),
    });
  }

  return scrapeQueueEvents[i];
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
