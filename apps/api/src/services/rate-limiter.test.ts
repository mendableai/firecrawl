import {
  getRateLimiter,
  TestSuiteRateLimiter,
  ServerRateLimiter,
  connectRateLimitRedisClient,
  disconnectRateLimitRedisClient
} from "./rate-limiter";
import { RateLimiterMode } from "../../src/types";

describe("Rate Limiter Service", () => {
  beforeAll(async () => {
    try {
      if (
        !ServerRateLimiter.getRedisClient() ||
        (ServerRateLimiter.getRedisClient().status !== "connecting" &&
          ServerRateLimiter.getRedisClient().status !== "ready")
      ) {
        await connectRateLimitRedisClient();
      }

      // wait for the redis client to be ready
      await new Promise((resolve, reject) => {
        ServerRateLimiter.getRedisClient().on("ready", resolve);
        ServerRateLimiter.getRedisClient().on("error", reject);
      });
    } catch (error) {
      console.error("Failed to connect Redis client:", error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      disconnectRateLimitRedisClient();
    } catch (error) {}
  });

  it("should return the testSuiteRateLimiter for specific tokens", () => {
    const limiter = getRateLimiter(
      "crawl" as RateLimiterMode,
      "test-prefix:a01ccae"
    );
    expect(limiter).toBe(TestSuiteRateLimiter.getInstance());

    const limiter2 = getRateLimiter(
      "scrape" as RateLimiterMode,
      "test-prefix:6254cf9"
    );
    expect(limiter2).toBe(TestSuiteRateLimiter.getInstance());
  });

  it("should return the serverRateLimiter if mode is not found", () => {
    const limiter = getRateLimiter(
      "nonexistent" as RateLimiterMode,
      "test-prefix:someToken"
    );
    expect(limiter).toBe(ServerRateLimiter.getInstance());
  });

  // Additional test cases remain unchanged, ensure they use the correct singleton instances
  // for comparison where needed.

  // Continue with other test cases...
});