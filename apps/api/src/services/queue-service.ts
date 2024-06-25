import Queue from "bull";
import { Queue as BullQueue } from "bull";

let webScraperQueue: BullQueue;

export function getWebScraperQueue() {
  if (!webScraperQueue) {
    webScraperQueue = new Queue("web-scraper", process.env.REDIS_URL, {
      settings: {
        lockDuration: 2 * 60 * 60 * 1000, // 2 hours in milliseconds,
        lockRenewTime: 30 * 60 * 1000, // 30 minutes in milliseconds
      },
    });
    console.log("Web scraper queue created");
  }
  return webScraperQueue;
}
