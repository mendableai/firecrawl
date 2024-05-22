import { RateLimiterRedis } from "rate-limiter-flexible";
import * as redis from "redis";
import { RateLimiterMode } from "../../src/types";

const MAX_CRAWLS_PER_MINUTE_STARTER = 3;
const MAX_CRAWLS_PER_MINUTE_STANDARD = 5;
const MAX_CRAWLS_PER_MINUTE_SCALE = 20;

const MAX_SCRAPES_PER_MINUTE_STARTER = 20;
const MAX_SCRAPES_PER_MINUTE_STANDARD = 40;
const MAX_SCRAPES_PER_MINUTE_SCALE = 50;

const MAX_SEARCHES_PER_MINUTE_STARTER = 20;
const MAX_SEARCHES_PER_MINUTE_STANDARD = 40;
const MAX_SEARCHES_PER_MINUTE_SCALE = 50;

const MAX_REQUESTS_PER_MINUTE_PREVIEW = 5;
const MAX_REQUESTS_PER_MINUTE_ACCOUNT = 20;
const MAX_REQUESTS_PER_MINUTE_CRAWL_STATUS = 150;

export const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
  legacyMode: true,
});

export const previewRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "preview",
  points: MAX_REQUESTS_PER_MINUTE_PREVIEW,
  duration: 60, // Duration in seconds
});

export const serverRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "server",
  points: MAX_REQUESTS_PER_MINUTE_ACCOUNT,
  duration: 60, // Duration in seconds
});

export const crawlStatusRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "crawl-status",
  points: MAX_REQUESTS_PER_MINUTE_CRAWL_STATUS,
  duration: 60, // Duration in seconds
});

export const testSuiteRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "test-suite",
  points: 10000,
  duration: 60, // Duration in seconds
});


export function getRateLimiter(mode: RateLimiterMode, token: string, plan?: string){
  // Special test suite case. TODO: Change this later.
  if (token.includes("5089cefa58") || token.includes("6254cf9")){
    return testSuiteRateLimiter;
  }
  switch (mode) {
    case RateLimiterMode.Preview:
      return previewRateLimiter;
    case RateLimiterMode.CrawlStatus:
      return crawlStatusRateLimiter;
    case RateLimiterMode.Crawl:
      if (plan === "standard"){
        return new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: "crawl-standard",
          points: MAX_CRAWLS_PER_MINUTE_STANDARD,
          duration: 60, // Duration in seconds
        });
      } else if (plan === "scale"){
        return new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: "crawl-scale",
          points: MAX_CRAWLS_PER_MINUTE_SCALE,
          duration: 60, // Duration in seconds
        });
      }
      return new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: "crawl-starter",
        points: MAX_CRAWLS_PER_MINUTE_STARTER,
        duration: 60, // Duration in seconds
      });
    case RateLimiterMode.Scrape:
      if (plan === "standard"){
        return new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: "scrape-standard",
          points: MAX_SCRAPES_PER_MINUTE_STANDARD,
          duration: 60, // Duration in seconds
        });
      } else if (plan === "scale"){
        return new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: "scrape-scale",
          points: MAX_SCRAPES_PER_MINUTE_SCALE,
          duration: 60, // Duration in seconds
        });
      }
      return new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: "scrape-starter",
        points: MAX_SCRAPES_PER_MINUTE_STARTER,
        duration: 60, // Duration in seconds
      });
    case RateLimiterMode.Search:
      if (plan === "standard"){
        return new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: "search-standard",
          points: MAX_SEARCHES_PER_MINUTE_STANDARD,
          duration: 60, // Duration in seconds
        });
      } else if (plan === "scale"){
        return new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: "search-scale",
          points: MAX_SEARCHES_PER_MINUTE_SCALE,
          duration: 60, // Duration in seconds
        });
      }
      return new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: "search-starter",
        points: MAX_SEARCHES_PER_MINUTE_STARTER,
        duration: 60, // Duration in seconds
      });
    default:
      return serverRateLimiter;
  }
}
