import { getRateLimiter, serverRateLimiter, testSuiteRateLimiter, redisClient } from "./rate-limiter";
import { RateLimiterMode } from "../../src/types";
import { RateLimiterRedis } from "rate-limiter-flexible";

describe("Rate Limiter Service", () => {
  beforeAll(async () => {
    await redisClient.connect();
  });

  afterAll(async () => {
    await redisClient.disconnect();
  });

  it("should return the testSuiteRateLimiter for specific tokens", () => {
    const limiter = getRateLimiter("crawl" as RateLimiterMode, "a01ccae");
    expect(limiter).toBe(testSuiteRateLimiter);

    const limiter2 = getRateLimiter("scrape" as RateLimiterMode, "6254cf9");
    expect(limiter2).toBe(testSuiteRateLimiter);
  });

  it("should return the serverRateLimiter if mode is not found", () => {
    const limiter = getRateLimiter("nonexistent" as RateLimiterMode, "someToken");
    expect(limiter).toBe(serverRateLimiter);
  });

  it("should return the correct rate limiter based on mode and plan", () => {
    const limiter = getRateLimiter("crawl" as RateLimiterMode, "someToken", "free");
    expect(limiter.points).toBe(2);

    const limiter2 = getRateLimiter("scrape" as RateLimiterMode, "someToken", "standard");
    expect(limiter2.points).toBe(50);

    const limiter3 = getRateLimiter("search" as RateLimiterMode, "someToken", "growth");
    expect(limiter3.points).toBe(500);

    const limiter4 = getRateLimiter("crawlStatus" as RateLimiterMode, "someToken", "growth");
    expect(limiter4.points).toBe(150);
  });

  it("should return the default rate limiter if plan is not provided", () => {
    const limiter = getRateLimiter("crawl" as RateLimiterMode, "someToken");
    expect(limiter.points).toBe(3);

    const limiter2 = getRateLimiter("scrape" as RateLimiterMode, "someToken");
    expect(limiter2.points).toBe(20);
  });

  it("should create a new RateLimiterRedis instance with correct parameters", () => {
    const keyPrefix = "test-prefix";
    const points = 10;
    const limiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix,
      points,
      duration: 60,
    });

    expect(limiter.keyPrefix).toBe(keyPrefix);
    expect(limiter.points).toBe(points);
    expect(limiter.duration).toBe(60);
  });

  it("should return the correct rate limiter for 'preview' mode", () => {
    const limiter = getRateLimiter("preview" as RateLimiterMode, "someToken", "free");
    expect(limiter.points).toBe(5);

    const limiter2 = getRateLimiter("preview" as RateLimiterMode, "someToken");
    expect(limiter2.points).toBe(5);
  });

  it("should return the correct rate limiter for 'account' mode", () => {
    const limiter = getRateLimiter("account" as RateLimiterMode, "someToken", "free");
    expect(limiter.points).toBe(100);

    const limiter2 = getRateLimiter("account" as RateLimiterMode, "someToken");
    expect(limiter2.points).toBe(100);
  });

  it("should return the correct rate limiter for 'crawlStatus' mode", () => {
    const limiter = getRateLimiter("crawlStatus" as RateLimiterMode, "someToken", "free");
    expect(limiter.points).toBe(150);

    const limiter2 = getRateLimiter("crawlStatus" as RateLimiterMode, "someToken");
    expect(limiter2.points).toBe(150);
  });
});
