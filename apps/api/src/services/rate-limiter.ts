import { RateLimiterRedis } from "rate-limiter-flexible";
import * as redis from "redis";
import { RateLimiterMode } from "../../src/types";

const RATE_LIMITS = {
  crawl: {
    default: 3,
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
    default: 20,
    free: 5,
    starter: 20,
    standard: 50,
    standardOld: 40,
    scale: 50,
    hobby: 10,
    standardNew: 50,
    growth: 500,
  },
  search: {
    default: 20,
    free: 5,
    starter: 20,
    standard: 40,
    standardOld: 40,
    scale: 50,
    hobby: 10,
    standardNew: 50,
    growth: 500,
  },
  preview: {
    free: 5,
    default: 5,
  },
  account: {
    free: 20,
    default: 20,
  },
  crawlStatus: {
    free: 150,
    default: 150,
  },
  testSuite: {
    free: 10000,
    default: 10000,
  },
};

export const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
  legacyMode: true,
});

const createRateLimiter = (keyPrefix, points) =>
  new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix,
    points,
    duration: 60, // Duration in seconds
  });

export const serverRateLimiter = createRateLimiter(
  "server",
  RATE_LIMITS.account.default
);

export const testSuiteRateLimiter = createRateLimiter(
  "test-suite",
  RATE_LIMITS.testSuite.default
);

export function getRateLimiter(
  mode: RateLimiterMode,
  token: string,
  plan?: string
) {
  if (token.includes("a01ccae") || token.includes("6254cf9")) {
    return testSuiteRateLimiter;
  }

  const rateLimitConfig = RATE_LIMITS[mode]; // {default : 5}
  if (!rateLimitConfig) return serverRateLimiter;

  const planKey = plan ? plan.replace("-", "") : "default"; // "default"
  const points =
    rateLimitConfig[planKey] || rateLimitConfig.default || rateLimitConfig; // 5

  return createRateLimiter(`${mode}-${planKey}`, points);
}
