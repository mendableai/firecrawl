import {
  getRateLimiter,
  TestSuiteRateLimiter,
  ServerRateLimiter,
  connectRateLimitRedisClient,
  disconnectRateLimitRedisClient
} from "./rate-limiter";
import { RateLimiterMode } from "../../src/types";
import { v4 as uuidv4 } from "uuid";

describe("Rate Limiter Service", () => {
  beforeAll(async () => {
    jest.useRealTimers();

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
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:a01ccae-${uuid}`
    );
    expect(limiter).toBe(TestSuiteRateLimiter.getInstance());

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:6254cf9-${uuid2}`
    );
    expect(limiter2).toBe(TestSuiteRateLimiter.getInstance());
  });

  it("should return the serverRateLimiter if mode is not found", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "nonexistent" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`
    );
    expect(limiter).toBe(ServerRateLimiter.getInstance());
  });

  it("should return the correct rate limiter based on mode and plan", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(2);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`,
      "standard"
    );
    expect(limiter2.points).toBe(50);

    const uuid3 = uuidv4();
    const limiter3 = getRateLimiter(
      "search" as RateLimiterMode,
      `test-prefix:someToken-${uuid3}`,
      "growth"
    );
    expect(limiter3.points).toBe(500);

    const uuid4 = uuidv4();
    const limiter4 = getRateLimiter(
      "crawlStatus" as RateLimiterMode,
      `test-prefix:someToken-${uuid4}`,
      "growth"
    );
    expect(limiter4.points).toBe(150);
  });

  it("should return the default rate limiter if plan is not provided", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`
    );
    expect(limiter.points).toBe(3);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(20);
  });

  it("should return the correct rate limiter for 'preview' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "preview" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(5);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "preview" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(5);
  });

  it("should return the correct rate limiter for 'account' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "account" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(100);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "account" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(100);
  });

  it("should return the correct rate limiter for 'crawlStatus' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawlStatus" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(150);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "crawlStatus" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(150);
  });

  it("should consume points correctly for 'crawl' mode", async () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:someTokenCRAWL-${uuid}`,
      "free"
    );
    const consumePoints = 1;

    const res = await limiter.consume(
      `test-prefix:someTokenCRAWL-${uuid}`,
      consumePoints
    );
    expect(res.remainingPoints).toBe(1);
  });

  it("should consume points correctly for 'scrape' mode (DEFAULT)", async () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:someTokenX-${uuid}`
    );
    const consumePoints = 4;

    const res = await limiter.consume(`test-prefix:someTokenX-${uuid}`, consumePoints);
    expect(res.remainingPoints).toBe(16);
  });

  it("should consume points correctly for 'scrape' mode (HOBBY)", async () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:someTokenXY-${uuid}`,
      "hobby"
    );
    expect(limiter.points).toBe(10);

    const consumePoints = 5;

    const res = await limiter.consume(`test-prefix:someTokenXY-${uuid}`, consumePoints);
    expect(res.consumedPoints).toBe(5);
    expect(res.remainingPoints).toBe(5);
  });

  it("should return the correct rate limiter for 'crawl' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(2);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`,
      "starter"
    );
    expect(limiter2.points).toBe(3);

    const uuid3 = uuidv4();
    const limiter3 = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:someToken-${uuid3}`,
      "standard"
    );
    expect(limiter3.points).toBe(5);
  });

  it("should return the correct rate limiter for 'scrape' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(5);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`,
      "starter"
    );
    expect(limiter2.points).toBe(20);

    const uuid3 = uuidv4();
    const limiter3 = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:someToken-${uuid3}`,
      "standard"
    );
    expect(limiter3.points).toBe(50);
  });

  it("should return the correct rate limiter for 'search' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "search" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(5);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "search" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`,
      "starter"
    );
    expect(limiter2.points).toBe(20);

    const uuid3 = uuidv4();
    const limiter3 = getRateLimiter(
      "search" as RateLimiterMode,
      `test-prefix:someToken-${uuid3}`,
      "standard"
    );
    expect(limiter3.points).toBe(40);
  });

  it("should return the correct rate limiter for 'preview' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "preview" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(5);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "preview" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(5);
  });

  it("should return the correct rate limiter for 'account' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "account" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(100);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "account" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(100);
  });

  it("should return the correct rate limiter for 'crawlStatus' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawlStatus" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(150);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "crawlStatus" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(150);
  });

  it("should return the correct rate limiter for 'testSuite' mode", () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "testSuite" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`,
      "free"
    );
    expect(limiter.points).toBe(10000);

    const uuid2 = uuidv4();
    const limiter2 = getRateLimiter(
      "testSuite" as RateLimiterMode,
      `test-prefix:someToken-${uuid2}`
    );
    expect(limiter2.points).toBe(10000);
  });

  it("should throw an error when consuming more points than available", async () => {
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "crawl" as RateLimiterMode,
      `test-prefix:someToken-${uuid}`
    );
    const consumePoints = limiter.points + 1;

    try {
      await limiter.consume(`test-prefix:someToken-${uuid}`, consumePoints);
    } catch (error) {
      // expect remaining points to be 0
      const res = await limiter.get(`test-prefix:someToken-${uuid}`);
      expect(res.remainingPoints).toBe(0);
    }
  });

  it("should reset points after duration", async () => {
    const duration = 60; // 60 seconds
    const uuid = uuidv4();
    const limiter = getRateLimiter(
      "scrape" as RateLimiterMode,
      `test-prefix:resetPointsToken-${uuid}`,
      "standard"
    );

    const points = limiter.points;
    const consumePoints = 4;
    await limiter.consume(`test-prefix:resetPointsToken-${uuid}`, consumePoints);
    
    await new Promise((resolve) => setTimeout(resolve, duration * 1000 + 100)); // Wait for duration + 100ms
    const res = await limiter.consume(`test-prefix:resetPointsToken-${uuid}`, consumePoints);
    expect(res.remainingPoints).toBe(points - consumePoints);
  }, 70000);
});