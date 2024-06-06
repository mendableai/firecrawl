import { RateLimiterRedis } from "rate-limiter-flexible";
import * as redis from "redis";
import { RateLimiterMode } from "../../src/types";

const RATE_LIMITS = {
  crawl: {
    free: 2,
    starter: 3,
    standard: 5,
    standardOld: 40,
    scale: 20,
    hobby: 3,
    standardNew: 10,
    growth: 50,
  },
  scrape: {
    free: 5,
    starter: 20,
    standard: 40,
    standardOld: 40,
    scale: 50,
    hobby: 10,
    standardNew: 50,
    growth: 500,
  },
  search: {
    free: 5,
    starter: 20,
    standard: 40,
    standardOld: 40,
    scale: 50,
    hobby: 10,
    standardNew: 50,
    growth: 500,
  },
  preview: 5,
  account: 20,
  crawlStatus: 150,
  testSuite: 10000,
};

export const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
  legacyMode: true,
});

const createRateLimiter = (keyPrefix, points) => new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix,
  points,
  duration: 60, // Duration in seconds
});

export const previewRateLimiter = createRateLimiter("preview", RATE_LIMITS.preview);
export const serverRateLimiter = createRateLimiter("server", RATE_LIMITS.account);
export const crawlStatusRateLimiter = createRateLimiter("crawl-status", RATE_LIMITS.crawlStatus);
export const testSuiteRateLimiter = createRateLimiter("test-suite", RATE_LIMITS.testSuite);

export function getRateLimiter(mode: RateLimiterMode, token: string, plan?: string) {
  if (token.includes("a01ccae") || token.includes("6254cf9")) {
    return testSuiteRateLimiter;
  }
  

  const rateLimitConfig = RATE_LIMITS[mode];
  if (!rateLimitConfig) return serverRateLimiter;

  const planKey = plan ? plan.replace("-", "") : "starter";
  const points = rateLimitConfig[planKey] || rateLimitConfig.preview;

  return createRateLimiter(`${mode}-${planKey}`, points);
}
