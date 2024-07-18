import Queue from "bull";
import { Queue as BullQueue } from "bull";

let webScraperQueue: BullQueue;

export function getWebScraperQueue() {
  if (!webScraperQueue) {
    webScraperQueue = new Queue("web-scraper", process.env.REDIS_URL, {
      settings: {
        lockDuration: 2 * 60 * 1000, // 1 minute in milliseconds,
        lockRenewTime: 15 * 1000, // 15 seconds in milliseconds
        stalledInterval: 30 * 1000,
        maxStalledCount: 10,
      },
    });
    console.log("Web scraper queue created");
  }
  return webScraperQueue;
}
