import { redisConnection } from "../services/queue-service";
import { addScrapeJob, addScrapeJobs } from "../services/queue-jobs";
import {
  cleanOldConcurrencyLimitEntries,
  pushConcurrencyLimitActiveJob,
  takeConcurrencyLimitedJob,
  removeConcurrencyLimitActiveJob,
} from "../lib/concurrency-limit";
import { getConcurrencyLimitMax } from "../services/rate-limiter";
import { WebScraperOptions, PlanType } from "../types";

// Mock all the dependencies
const mockAdd = jest.fn();
jest.mock("../services/queue-service", () => ({
  redisConnection: {
    zremrangebyscore: jest.fn(),
    zrangebyscore: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
    zmpop: jest.fn(),
    zcard: jest.fn(),
    smembers: jest.fn(),
  },
  getScrapeQueue: jest.fn(() => ({
    add: mockAdd,
  })),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid"),
}));

describe("Queue Concurrency Integration", () => {
  const mockTeamId = "test-team-id";
  const mockPlan = "standard" as PlanType;
  const mockNow = Date.now();

  const defaultScrapeOptions = {
    formats: ["markdown"] as (
      | "markdown"
      | "html"
      | "rawHtml"
      | "links"
      | "screenshot"
      | "screenshot@fullPage"
      | "extract"
      | "json"
    )[],
    onlyMainContent: true,
    waitFor: 0,
    mobile: false,
    parsePDF: false,
    timeout: 30000,
    extract: {
      mode: "llm" as const,
      systemPrompt: "test",
      schema: {},
    },
    extractOptions: { mode: "llm" as const, systemPrompt: "test" },
    proxy: false,
    proxyCountry: "us",
    proxyOptions: {},
    javascript: true,
    headers: {},
    cookies: [],
    blockResources: true,
    skipTlsVerification: false,
    removeBase64Images: true,
    fastMode: false,
    blockAds: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockImplementation(() => mockNow);
  });

  describe("Single Job Addition", () => {
    const mockWebScraperOptions: WebScraperOptions = {
      url: "https://test.com",
      mode: "single_urls",
      team_id: mockTeamId,
      plan: mockPlan,
      scrapeOptions: defaultScrapeOptions,
      crawlerOptions: null,
    };

    it("should add job directly to BullMQ when under concurrency limit", async () => {
      // Mock current active jobs to be under limit
      (redisConnection.zrangebyscore as jest.Mock).mockResolvedValue([]);

      await addScrapeJob(mockWebScraperOptions);

      // Should have checked concurrency
      expect(redisConnection.zrangebyscore).toHaveBeenCalled();

      // Should have added to BullMQ
      expect(mockAdd).toHaveBeenCalled();

      // Should have added to active jobs
      expect(redisConnection.zadd).toHaveBeenCalledWith(
        expect.stringContaining("concurrency-limiter"),
        expect.any(Number),
        expect.any(String),
      );
    });

    it("should add job to concurrency queue when at concurrency limit", async () => {
      // Mock current active jobs to be at limit
      const maxConcurrency = getConcurrencyLimitMax(mockPlan);
      const activeJobs = Array(maxConcurrency).fill("active-job");
      (redisConnection.zrangebyscore as jest.Mock).mockResolvedValue(
        activeJobs,
      );

      await addScrapeJob(mockWebScraperOptions);

      // Should have checked concurrency
      expect(redisConnection.zrangebyscore).toHaveBeenCalled();

      // Should NOT have added to BullMQ
      expect(mockAdd).not.toHaveBeenCalled();

      // Should have added to concurrency queue
      expect(redisConnection.zadd).toHaveBeenCalledWith(
        expect.stringContaining("concurrency-limit-queue"),
        expect.any(Number),
        expect.stringContaining("mock-uuid"),
      );
    });
  });

  describe("Batch Job Addition", () => {
    const createMockJobs = (count: number) =>
      Array(count)
        .fill(null)
        .map((_, i) => ({
          data: {
            url: `https://test${i}.com`,
            mode: "single_urls",
            team_id: mockTeamId,
            plan: mockPlan,
            scrapeOptions: defaultScrapeOptions,
          } as WebScraperOptions,
          opts: {
            jobId: `job-${i}`,
            priority: 1,
          },
        }));

    it("should handle batch jobs respecting concurrency limits", async () => {
      const maxConcurrency = getConcurrencyLimitMax(mockPlan);
      const totalJobs = maxConcurrency + 5; // Some jobs should go to queue
      const mockJobs = createMockJobs(totalJobs);

      // Mock current active jobs to be empty
      (redisConnection.zrangebyscore as jest.Mock).mockResolvedValue([]);

      await addScrapeJobs(mockJobs);

      // Should have added maxConcurrency jobs to BullMQ
      expect(mockAdd).toHaveBeenCalledTimes(maxConcurrency);

      // Should have added remaining jobs to concurrency queue
      expect(redisConnection.zadd).toHaveBeenCalledWith(
        expect.stringContaining("concurrency-limit-queue"),
        expect.any(Number),
        expect.any(String),
      );
    });

    it("should handle empty job array", async () => {
      const result = await addScrapeJobs([]);
      expect(result).toBe(true);
      expect(mockAdd).not.toHaveBeenCalled();
      expect(redisConnection.zadd).not.toHaveBeenCalled();
    });
  });

  describe("Queue Worker Integration", () => {
    it("should process next queued job when active job completes", async () => {
      const mockJob = {
        id: "test-job",
        data: {
          team_id: mockTeamId,
          plan: mockPlan,
        },
      };

      // Mock a queued job
      const queuedJob = {
        id: "queued-job",
        data: { test: "data" },
        opts: {},
      };
      (redisConnection.zmpop as jest.Mock).mockResolvedValueOnce([
        "key",
        [[JSON.stringify(queuedJob)]],
      ]);

      // Simulate job completion in worker
      await removeConcurrencyLimitActiveJob(mockTeamId, mockJob.id);
      await cleanOldConcurrencyLimitEntries(mockTeamId);

      const nextJob = await takeConcurrencyLimitedJob(mockTeamId);

      // Should have taken next job from queue
      expect(nextJob).toEqual(queuedJob);

      // Should have added new job to active jobs
      await pushConcurrencyLimitActiveJob(mockTeamId, nextJob!.id, 2 * 60 * 1000);
      expect(redisConnection.zadd).toHaveBeenCalledWith(
        expect.stringContaining("concurrency-limiter"),
        expect.any(Number),
        nextJob!.id,
      );
    });

    it("should handle job failure and cleanup", async () => {
      const mockJob = {
        id: "failing-job",
        data: {
          team_id: mockTeamId,
          plan: mockPlan,
        },
      };

      // Add job to active jobs
      await pushConcurrencyLimitActiveJob(mockTeamId, mockJob.id, 2 * 60 * 1000);

      // Simulate job failure and cleanup
      await removeConcurrencyLimitActiveJob(mockTeamId, mockJob.id);
      await cleanOldConcurrencyLimitEntries(mockTeamId);

      // Verify job was removed from active jobs
      expect(redisConnection.zrem).toHaveBeenCalledWith(
        expect.stringContaining("concurrency-limiter"),
        mockJob.id,
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle stalled jobs cleanup", async () => {
      const stalledTime = mockNow - 3 * 60 * 1000; // 3 minutes ago

      // Mock stalled jobs in Redis
      (redisConnection.zrangebyscore as jest.Mock).mockResolvedValueOnce([
        "stalled-job",
      ]);

      await cleanOldConcurrencyLimitEntries(mockTeamId, mockNow);

      // Should have cleaned up stalled jobs
      expect(redisConnection.zremrangebyscore).toHaveBeenCalledWith(
        expect.stringContaining("concurrency-limiter"),
        -Infinity,
        mockNow,
      );
    });

    it("should handle race conditions in job queue processing", async () => {
      // Mock a race condition where job is taken by another worker
      (redisConnection.zmpop as jest.Mock).mockResolvedValueOnce(null);

      const nextJob = await takeConcurrencyLimitedJob(mockTeamId);

      // Should handle gracefully when no job is available
      expect(nextJob).toBeNull();
    });
  });
});
