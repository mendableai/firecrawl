import Queue from "bull";
import { Queue as BullQueue } from "bull";
import { Logger } from "../lib/logger";

let webScraperQueue: BullQueue;

export function getWebScraperQueue() {
  if (!webScraperQueue) {
    webScraperQueue = new Queue("web-scraper", process.env.REDIS_URL, {
      settings: {
        lockDuration: 1 * 60 * 1000, // 1 minute in milliseconds,
        lockRenewTime: 15 * 1000, // 15 seconds in milliseconds
        stalledInterval: 30 * 1000,
        maxStalledCount: 10,
      },
      defaultJobOptions:{
        attempts: 5
      }
    });
    Logger.info("Web scraper queue created");
  }
  return webScraperQueue;
}
