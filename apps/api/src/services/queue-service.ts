import Queue from "bull";

let webScraperQueue;

export function getWebScraperQueue() {
  if (!webScraperQueue) {
    webScraperQueue = new Queue("web-scraper", process.env.REDIS_URL, {
      settings: {
        lockDuration: 4 * 60 * 60 * 1000, // 4 hours in milliseconds,
        lockRenewTime: 30 * 60 * 1000, // 30 minutes in milliseconds
      },
    });
    console.log("Web scraper queue created");
  }
  return webScraperQueue;
}
