import { Queue } from "bullmq";
import { Logger } from "../lib/logger";
import IORedis from "ioredis";
import { Worker } from "bullmq";
import systemMonitor from "./system-monitor";
import { v4 as uuidv4 } from "uuid";

let webScraperQueue: Queue;
export const redisConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});




export const webScraperQueueName = "{webscraperQueue}";
export function getWebScraperQueue() {
  if (!webScraperQueue) {
    webScraperQueue = new Queue(
      webScraperQueueName,
      {
        connection: redisConnection,
      }
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
    Logger.info("Web scraper queue created");
  }
  return webScraperQueue;
}


