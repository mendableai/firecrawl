import { RateLimiterRedis } from "rate-limiter-flexible";
import { RateLimiterMode } from "../types";
import Redis from "ioredis";
import type { AuthCreditUsageChunk } from "../controllers/v1/types";

export const redisRateLimitClient = new Redis(
  process.env.REDIS_RATE_LIMIT_URL!,
);

const createRateLimiter = (keyPrefix, points) =>
  new RateLimiterRedis({
    storeClient: redisRateLimitClient,
    keyPrefix,
    points,
    duration: 60, // Duration in seconds
  });

export const testSuiteRateLimiter = new RateLimiterRedis({
  storeClient: redisRateLimitClient,
  keyPrefix: "test-suite",
  points: 10000,
  duration: 60, // Duration in seconds
});

// TODO: PUT OVERRIDES FOR THESE INTO THE DB - mogery
const testSuiteTokens = [
  "a01ccae",
  "6254cf9",
  "0f96e673",
  "23befa1b",
  "69141c4",
  "48f9a97",
  "5dc70ad",
  "e5e60e5",
  "65181ba",
  "77c85b7",
  "8567275",
  "6c46abb",
  "cb0ff78",
  "fd769b2",
  // "4c2638d",
  "cbb3462", // don't remove (s-ai)
  "824abcd", // don't remove (s-ai)
  "0966288",
  "226556f",
  "0a18c9e", // gh
];

// TODO: PUT OVERRIDES FOR THESE INTO THE DB - mogery
// const manual_growth = ["22a07b64-cbfe-4924-9273-e3f01709cdf2"];
// const manual = ["69be9e74-7624-4990-b20d-08e0acc70cf6", "9661a311-3d75-45d2-bb70-71004d995873"];
// const manual_etier2c = ["77545e01-9cec-4fa9-8356-883fc66ac13e", "778c62c4-306f-4039-b372-eb20174760c0"];

const fallbackRateLimits: AuthCreditUsageChunk["rate_limits"] = {
  crawl: 15,
  scrape: 100,
  search: 100,
  map: 100,
  extract: 100,
  preview: 25,
  extractStatus: 25000,
  crawlStatus: 25000,
};

export function getRateLimiter(
  mode: RateLimiterMode,
  rate_limits: AuthCreditUsageChunk["rate_limits"] | null,
): RateLimiterRedis {
  return createRateLimiter(
    `${mode}`,
    (rate_limits ?? fallbackRateLimits)[mode] ?? 500,
  );
}

export function isTestSuiteToken(token: string): boolean {
  return testSuiteTokens.some((testToken) => token.includes(testToken));
}
