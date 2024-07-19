import { RateLimiterRedis } from "rate-limiter-flexible";
import { RateLimiterMode } from "../../src/types";
import Redis from "ioredis";

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
    standardnew: 10,
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
    standardnew: 50,
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
    standardnew: 50,
    growth: 500,
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
    free: 150,
    default: 150,
  },
  testSuite: {
    free: 10000,
    default: 10000,
  },
};

const redisRateLimitClient = new Redis(
  process.env.REDIS_RATE_LIMIT_URL
)

export async function connectRateLimitRedisClient() {
  return await redisRateLimitClient.connect();
}

export function disconnectRateLimitRedisClient() {
  return redisRateLimitClient.disconnect();
}

// singleton
export class RateLimiter {
  private static instance: RateLimiterRedis | null = null;

  private constructor() {}

  public static getInstance(keyPrefix: string, points: number): RateLimiterRedis {
    if (!redisRateLimitClient.status || redisRateLimitClient.status !== 'ready') {
      throw new Error('Redis client not connected');
    }
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiterRedis({
        storeClient: redisRateLimitClient,
        keyPrefix,
        points,
        duration: 60,
      });
    }
    return RateLimiter.instance;
  }
}

// singleton
export class TestSuiteRateLimiter {
  private static instance: RateLimiterRedis | null = null;

  private constructor() {}

  public static getInstance(): RateLimiterRedis {
    if (!redisRateLimitClient.status || redisRateLimitClient.status !== 'ready') {
      throw new Error('Redis client not connected');
    }
    if (!TestSuiteRateLimiter.instance) {
      TestSuiteRateLimiter.instance = new RateLimiterRedis({
        storeClient: redisRateLimitClient,
        keyPrefix: "test-suite",
        points: 10000,
        duration: 60, // Duration in seconds
      });
    }
    return TestSuiteRateLimiter.instance;
  }
}

// singleton
export class ServerRateLimiter {
  private static instance: RateLimiterRedis | null = null;

  private constructor() {}

  public static getRedisClient(): Redis {
    return redisRateLimitClient;
  }

  public static getInstance(): RateLimiterRedis {
    if (!redisRateLimitClient.status || redisRateLimitClient.status !== 'ready') {
      throw new Error('Redis client not connected');
    }
    if (!ServerRateLimiter.instance) {
      ServerRateLimiter.instance = new RateLimiterRedis({
        storeClient: redisRateLimitClient,
        keyPrefix: "server",
        points: 5,
        duration: 60, // Duration in seconds
      });
    }
    return ServerRateLimiter.instance;
  }
}

export function getRateLimiter(
  mode: RateLimiterMode,
  token: string,
  plan?: string
): RateLimiterRedis {
  if (token.includes("a01ccae") || token.includes("6254cf9")) {
    return TestSuiteRateLimiter.getInstance();
  }

  const rateLimitConfig = RATE_LIMITS[mode]; // {default : 5}
  if (!rateLimitConfig) return ServerRateLimiter.getInstance();

  const planKey = plan ? plan.replace("-", "") : "default"; // "default"
  const points =
    rateLimitConfig[planKey] || rateLimitConfig.default || rateLimitConfig; // 5

  return RateLimiter.getInstance(`${mode}-${planKey}`, points);
}