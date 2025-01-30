import { RateLimiterRedis } from "rate-limiter-flexible";
import { PlanType, RateLimiterMode } from "../../src/types";
import Redis from "ioredis";

export const CONCURRENCY_LIMIT: Omit<Record<PlanType, number>, ""> = {
  free: 2,
  hobby: 4,
  starter: 10,
  standard: 10,
  standardNew: 10,
  standardnew: 10,
  scale: 100,
  growth: 100,
  growthdouble: 100,
  etier2c: 300,
  etier1a: 200,
  etier2a: 300,
  etierscale1: 150,
  testSuite: 200,
  devB: 120,
  etier2d: 250,
  manual: 200,
  extract_starter: 20,
  extract_explorer: 100,
  extract_pro: 200
};

const RATE_LIMITS = {
  crawl: {
    default: 3,
    free: 2,
    starter: 10,
    standard: 5,
    standardOld: 40,
    scale: 50,
    hobby: 3,
    standardNew: 10,
    standardnew: 10,
    growth: 50,
    growthdouble: 50,
    etier2c: 300,
    etier1a: 1000,
    etier2a: 300,
    etierscale1: 150,
    // extract ops
    extract_starter: 20,
    extract_explorer: 100,
    extract_pro: 1000,
  },
  scrape: {
    default: 20,
    free: 10,
    starter: 100,
    standard: 100,
    standardOld: 100,
    scale: 500,
    hobby: 20,
    standardNew: 100,
    standardnew: 100,
    growth: 1000,
    growthdouble: 1000,
    etier2c: 2500,
    etier1a: 1000,
    etier2a: 2500,
    etierscale1: 1500,
    // extract ops
    extract_starter: 20,
    extract_explorer: 100,
    extract_pro: 1000,
  },
  search: {
    default: 20,
    free: 5,
    starter: 50,
    standard: 50,
    standardOld: 40,
    scale: 500,
    hobby: 10,
    standardNew: 50,
    standardnew: 50,
    growth: 500,
    growthdouble: 500,
    etier2c: 2500,
    etier1a: 1000,
    etier2a: 2500,
    etierscale1: 1500,
    // extract ops
    extract_starter: 20,
    extract_explorer: 100,
    extract_pro: 1000,
  },
  map: {
    default: 20,
    free: 5,
    starter: 50,
    standard: 50,
    standardOld: 50,
    scale: 500,
    hobby: 10,
    standardNew: 50,
    standardnew: 50,
    growth: 1000,
    growthdouble: 1000,
    etier2c: 2500,
    etier1a: 1000,
    etier2a: 2500,
    etierscale1: 1500,
    // extract ops
    extract_starter: 20,
    extract_explorer: 100,
    extract_pro: 1000,
  },
  extract: {
    default: 20,
    free: 10,
    starter: 100,
    standard: 100,
    standardOld: 100,
    scale: 300,
    hobby: 20,
    standardNew: 100,
    standardnew: 100,
    growth: 300,
    growthdouble: 300,
    etier2c: 1000,
    etier1a: 1000,
    etier2a: 1000,
    etierscale1: 1000,
    extract_starter: 20,
    extract_explorer: 100,
    extract_pro: 1000,
  },
  preview: {
    free: 5,
    default: 5,
  },
  account: {
    free: 100,
    default: 100,
  },
  crawlStatus: {
    free: 500,
    default: 5000,
  },
  extractStatus: {
    free: 500,
    default: 5000,
  },
  testSuite: {
    free: 10000,
    default: 10000,
  },
};

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

export const serverRateLimiter = createRateLimiter(
  "server",
  RATE_LIMITS.account.default,
);

export const testSuiteRateLimiter = new RateLimiterRedis({
  storeClient: redisRateLimitClient,
  keyPrefix: "test-suite",
  points: 10000,
  duration: 60, // Duration in seconds
});

export const devBRateLimiter = new RateLimiterRedis({
  storeClient: redisRateLimitClient,
  keyPrefix: "dev-b",
  points: 1200,
  duration: 60, // Duration in seconds
});

export const manualRateLimiter = new RateLimiterRedis({
  storeClient: redisRateLimitClient,
  keyPrefix: "manual",
  points: 2000,
  duration: 60, // Duration in seconds
});

export const scrapeStatusRateLimiter = new RateLimiterRedis({
  storeClient: redisRateLimitClient,
  keyPrefix: "scrape-status",
  points: 400,
  duration: 60, // Duration in seconds
});

export const etier1aRateLimiter = new RateLimiterRedis({
  storeClient: redisRateLimitClient,
  keyPrefix: "etier1a",
  points: 10000,
  duration: 60, // Duration in seconds
});

export const etier2aRateLimiter = new RateLimiterRedis({
  storeClient: redisRateLimitClient,
  keyPrefix: "etier2a",
  points: 2500,
  duration: 60, // Duration in seconds
});

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
  "4c2638d",
  "cbb3462", // don't remove (s-ai)
  "824abcd", // don't remove (s-ai)
  "0966288",
];

const manual = ["69be9e74-7624-4990-b20d-08e0acc70cf6"];

function makePlanKey(plan?: string) {
  return plan ? plan.replace("-", "") : "default"; // "default"
}

export function getRateLimiterPoints(
  mode: RateLimiterMode,
  token?: string,
  plan?: string,
  teamId?: string,
): number {
  const rateLimitConfig = RATE_LIMITS[mode]; // {default : 5}

  if (!rateLimitConfig) return RATE_LIMITS.account.default;

  const points: number =
    rateLimitConfig[makePlanKey(plan)] || rateLimitConfig.default; // 5

  return points;
}

export function getRateLimiter(
  mode: RateLimiterMode,
  token?: string,
  plan?: string,
  teamId?: string,
): RateLimiterRedis {
  if (token && testSuiteTokens.some((testToken) => token.includes(testToken))) {
    return testSuiteRateLimiter;
  }

  if (teamId && teamId === process.env.DEV_B_TEAM_ID) {
    return devBRateLimiter;
  }

  if (teamId && teamId === process.env.ETIER1A_TEAM_ID) {
    return etier1aRateLimiter;
  }

  if (teamId && teamId === process.env.ETIER2A_TEAM_ID) {
    return etier2aRateLimiter;
  }

  if (teamId && teamId === process.env.ETIER2D_TEAM_ID) {
    return etier2aRateLimiter;
  }

  if (teamId && manual.includes(teamId)) {
    return manualRateLimiter;
  }

  return createRateLimiter(
    `${mode}-${makePlanKey(plan)}`,
    getRateLimiterPoints(mode, token, plan, teamId),
  );
}

export function getConcurrencyLimitMax(
  plan: PlanType,
  teamId?: string,
): number {
  // Moved this to auth check, plan will come as testSuite if token is present
  // if (token && testSuiteTokens.some((testToken) => token.includes(testToken))) {
  //   return CONCURRENCY_LIMIT.testSuite;
  // }
  if (teamId && teamId === process.env.DEV_B_TEAM_ID) {
    return CONCURRENCY_LIMIT.devB;
  }

  if (teamId && teamId === process.env.ETIER1A_TEAM_ID) {
    return CONCURRENCY_LIMIT.etier1a;
  }

  if (teamId && teamId === process.env.ETIER2A_TEAM_ID) {
    return CONCURRENCY_LIMIT.etier2a;
  }

  if (teamId && teamId === process.env.ETIER2D_TEAM_ID) {
    return CONCURRENCY_LIMIT.etier2a;
  }

  if (teamId && manual.includes(teamId)) {
    return CONCURRENCY_LIMIT.manual;
  }

  return CONCURRENCY_LIMIT[plan] ?? 10;
}

export function isTestSuiteToken(token: string): boolean {
  return testSuiteTokens.some((testToken) => token.includes(testToken));
}
