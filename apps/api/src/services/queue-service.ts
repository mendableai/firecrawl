import { Queue, QueueEvents } from "bullmq";
import { logger } from "../lib/logger";
import IORedis from "ioredis";
import { BullMQOtel } from "bullmq-otel";

export type QueueFunction = () => Queue<any, any, string, any, any, string>;

let scrapeQueues: Queue[] = [];
let scrapeQueueEvents: QueueEvents[] = [];
let extractQueue: Queue;
let loggingQueue: Queue;
let indexQueue: Queue;
let deepResearchQueue: Queue;
let generateLlmsTxtQueue: Queue;
let billingQueue: Queue;
let precrawlQueue: Queue;
let redisConnection: IORedis;

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
    redisConnection.on("connect", () => logger.info("Redis connected"));
    redisConnection.on("reconnecting", () => logger.warn("Redis reconnecting"));
    redisConnection.on("error", (err) => logger.warn("Redis error", { err }));

  }
  return redisConnection;
}

export const extractQueueName = "{extractQueue}";
export const loggingQueueName = "{loggingQueue}";
export const indexQueueName = "{indexQueue}";
export const generateLlmsTxtQueueName = "{generateLlmsTxtQueue}";
export const deepResearchQueueName = "{deepResearchQueue}";
export const billingQueueName = "{billingQueue}";
export const precrawlQueueName = "{precrawlQueue}";

export const queueMultiplexWidth = process.env.QUEUE_MULTIPLEX_WIDTH ? parseInt(process.env.QUEUE_MULTIPLEX_WIDTH) : 1;

function uuidToQueueIndex(uuid: string) {
  const queueIndex = parseInt(uuid[0] ?? "0", 16) % queueMultiplexWidth;
  return queueIndex;
}

export function getScrapeQueue(uuid: string) {
  const queueIndex = uuidToQueueIndex(uuid);
  return getScrapeQueueByIndex(queueIndex);
}

export function getScrapeQueueByIndex(index: number) {
  if (!scrapeQueues[index]) {
    scrapeQueues[index] = new Queue(`{scrapeQueue${index === 0 ? "" : index}}`, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 3600, // 1 hour
        },
        removeOnFail: {
          age: 3600, // 1 hour
        },
      },
      telemetry: new BullMQOtel("firecrawl-bullmq"),
    });
  }
  return scrapeQueues[index];
}

export function getScrapeQueueEvents(uuid: string) {
  const queueIndex = uuidToQueueIndex(uuid);
  return getScrapeQueueEventsByIndex(queueIndex);
}

export function getScrapeQueueEventsByIndex(index: number) {
  if (!scrapeQueueEvents[index]) {
    scrapeQueueEvents[index] = new QueueEvents(`{scrapeQueue${index === 0 ? "" : index}}`, {
      connection: getRedisConnection(),
    });
  }

  return scrapeQueueEvents[index];
}

export function getExtractQueue() {
  if (!extractQueue) {
    extractQueue = new Queue(extractQueueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 90000, // 25 hours
        },
        removeOnFail: {
          age: 90000, // 25 hours
        },
      },
      telemetry: new BullMQOtel("firecrawl-bullmq"),
    });
  }
  return extractQueue;
}

export function getGenerateLlmsTxtQueue() {
  if (!generateLlmsTxtQueue) {
    generateLlmsTxtQueue = new Queue(generateLlmsTxtQueueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 90000, // 25 hours
        },
        removeOnFail: {
          age: 90000, // 25 hours
        },
      },
      telemetry: new BullMQOtel("firecrawl-bullmq"),
    });
  }
  return generateLlmsTxtQueue;
}

export function getDeepResearchQueue() {
  if (!deepResearchQueue) {
    deepResearchQueue = new Queue(deepResearchQueueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 90000, // 25 hours
        },
        removeOnFail: {
          age: 90000, // 25 hours
        },
      },
      telemetry: new BullMQOtel("firecrawl-bullmq"),
    });
  }
  return deepResearchQueue;
}

export function getBillingQueue() {
  if (!billingQueue) {
    billingQueue = new Queue(billingQueueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 60, // 1 minute
        },
        removeOnFail: {
          age: 3600, // 1 hour
        },
      },
      telemetry: new BullMQOtel("firecrawl-bullmq"),
    });
  }
  return billingQueue;
}

export function getPrecrawlQueue() {
  if (!precrawlQueue) {
    precrawlQueue = new Queue(precrawlQueueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: {
          age: 24 * 60 * 60, // 1 day
        },
        removeOnFail: {
          age: 24 * 60 * 60, // 1 day
        },
      },
      telemetry: new BullMQOtel("firecrawl-bullmq"),
    });
  }
  return precrawlQueue;
}
