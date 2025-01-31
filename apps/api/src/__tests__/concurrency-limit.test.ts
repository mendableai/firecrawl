import { redisConnection } from "../services/queue-service";
import {
  cleanOldConcurrencyLimitEntries,
  getConcurrencyLimitActiveJobs,
  pushConcurrencyLimitActiveJob,
  removeConcurrencyLimitActiveJob,
  takeConcurrencyLimitedJob,
  pushConcurrencyLimitedJob,
  getConcurrencyQueueJobsCount,
  ConcurrencyLimitedJob,
} from "../lib/concurrency-limit";
import { CONCURRENCY_LIMIT, getConcurrencyLimitMax } from "../services/rate-limiter";
import { PlanType } from "../types";

// Mock Redis client
jest.mock("../services/queue-service", () => ({
  redisConnection: {
    zremrangebyscore: jest.fn(),
    zrangebyscore: jest.fn(),
    zadd: jest.fn(),
    zrem: jest.fn(),
    zmpop: jest.fn(),
    zcard: jest.fn(),
  },
}));

describe("Concurrency Limit", () => {
  const mockTeamId = "test-team-id";
  const mockJobId = "test-job-id";
  const mockNow = 1000000;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("cleanOldConcurrencyLimitEntries", () => {
    it("should remove entries older than current timestamp", async () => {
      await cleanOldConcurrencyLimitEntries(mockTeamId, mockNow);
      
      expect(redisConnection.zremrangebyscore).toHaveBeenCalledWith(
        "concurrency-limiter:test-team-id",
        -Infinity,
        mockNow
      );
    });
  });

  describe("getConcurrencyLimitActiveJobs", () => {
    it("should return active jobs after given timestamp", async () => {
      const mockActiveJobs = ["job1", "job2"];
      (redisConnection.zrangebyscore as jest.Mock).mockResolvedValue(mockActiveJobs);

      const result = await getConcurrencyLimitActiveJobs(mockTeamId, mockNow);

      expect(result).toEqual(mockActiveJobs);
      expect(redisConnection.zrangebyscore).toHaveBeenCalledWith(
        "concurrency-limiter:test-team-id",
        mockNow,
        Infinity
      );
    });

    it("should return empty array when no active jobs", async () => {
      (redisConnection.zrangebyscore as jest.Mock).mockResolvedValue([]);

      const result = await getConcurrencyLimitActiveJobs(mockTeamId, mockNow);

      expect(result).toEqual([]);
    });
  });

  describe("pushConcurrencyLimitActiveJob", () => {
    it("should add job with expiration timestamp", async () => {
      await pushConcurrencyLimitActiveJob(mockTeamId, mockJobId, 2 * 60 * 1000, mockNow);

      expect(redisConnection.zadd).toHaveBeenCalledWith(
        "concurrency-limiter:test-team-id",
        mockNow + 2 * 60 * 1000, // stalledJobTimeoutMs
        mockJobId
      );
    });
  });

  describe("removeConcurrencyLimitActiveJob", () => {
    it("should remove job from active jobs", async () => {
      await removeConcurrencyLimitActiveJob(mockTeamId, mockJobId);

      expect(redisConnection.zrem).toHaveBeenCalledWith(
        "concurrency-limiter:test-team-id",
        mockJobId
      );
    });
  });

  describe("Queue Operations", () => {
    const mockJob: ConcurrencyLimitedJob = {
      id: mockJobId,
      data: { test: "data" },
      opts: {},
      priority: 1,
    };

    describe("takeConcurrencyLimitedJob", () => {
      it("should return null when queue is empty", async () => {
        (redisConnection.zmpop as jest.Mock).mockResolvedValue(null);

        const result = await takeConcurrencyLimitedJob(mockTeamId);

        expect(result).toBeNull();
      });

      it("should return and remove the highest priority job", async () => {
        (redisConnection.zmpop as jest.Mock).mockResolvedValue([
          "key",
          [[JSON.stringify(mockJob)]],
        ]);

        const result = await takeConcurrencyLimitedJob(mockTeamId);

        expect(result).toEqual(mockJob);
        expect(redisConnection.zmpop).toHaveBeenCalledWith(
          1,
          "concurrency-limit-queue:test-team-id",
          "MIN"
        );
      });
    });

    describe("pushConcurrencyLimitedJob", () => {
      it("should add job to queue with priority", async () => {
        await pushConcurrencyLimitedJob(mockTeamId, mockJob);

        expect(redisConnection.zadd).toHaveBeenCalledWith(
          "concurrency-limit-queue:test-team-id",
          mockJob.priority,
          JSON.stringify(mockJob)
        );
      });

      it("should use default priority 1 when not specified", async () => {
        const jobWithoutPriority = { ...mockJob };
        delete jobWithoutPriority.priority;

        await pushConcurrencyLimitedJob(mockTeamId, jobWithoutPriority);

        expect(redisConnection.zadd).toHaveBeenCalledWith(
          "concurrency-limit-queue:test-team-id",
          1,
          JSON.stringify(jobWithoutPriority)
        );
      });
    });

    describe("getConcurrencyQueueJobsCount", () => {
      it("should return the number of jobs in queue", async () => {
        const mockCount = 5;
        (redisConnection.zcard as jest.Mock).mockResolvedValue(mockCount);

        const result = await getConcurrencyQueueJobsCount(mockTeamId);

        expect(result).toBe(mockCount);
        expect(redisConnection.zcard).toHaveBeenCalledWith(
          "concurrency-limit-queue:test-team-id"
        );
      });

      it("should return 0 for empty queue", async () => {
        (redisConnection.zcard as jest.Mock).mockResolvedValue(0);

        const result = await getConcurrencyQueueJobsCount(mockTeamId);

        expect(result).toBe(0);
      });
    });
  });

  describe("getConcurrencyLimitMax", () => {
    it("should return correct limit for free plan", () => {
      const result = getConcurrencyLimitMax("free");
      expect(result).toBe(2);
    });

    it("should return correct limit for standard plan", () => {
      const result = getConcurrencyLimitMax("standard");
      expect(result).toBe(CONCURRENCY_LIMIT.standard);
    });

    it("should return correct limit for scale plan", () => {
      const result = getConcurrencyLimitMax("scale");
      expect(result).toBe(CONCURRENCY_LIMIT.scale);
    });

    it("should return default limit for unknown plan", () => {
      const result = getConcurrencyLimitMax("unknown" as PlanType);
      expect(result).toBe(10);
    });

    it("should handle special team IDs", () => {
      process.env.DEV_B_TEAM_ID = "dev-b-team";
      const result = getConcurrencyLimitMax("free", "dev-b-team");
      expect(result).toBe(120);
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete job lifecycle", async () => {
      const mockJob: ConcurrencyLimitedJob = {
        id: "lifecycle-test",
        data: { test: "lifecycle" },
        opts: {},
      };

      // Push job to queue
      await pushConcurrencyLimitedJob(mockTeamId, mockJob);
      expect(redisConnection.zadd).toHaveBeenCalled();

      // Take job from queue
      (redisConnection.zmpop as jest.Mock).mockResolvedValue([
        "key",
        [[JSON.stringify(mockJob)]],
      ]);
      const takenJob = await takeConcurrencyLimitedJob(mockTeamId);
      expect(takenJob).toEqual(mockJob);

      // Add to active jobs
      await pushConcurrencyLimitActiveJob(mockTeamId, mockJob.id, 2 * 60 * 1000, mockNow);
      expect(redisConnection.zadd).toHaveBeenCalled();

      // Verify active jobs
      (redisConnection.zrangebyscore as jest.Mock).mockResolvedValue([mockJob.id]);
      const activeJobs = await getConcurrencyLimitActiveJobs(mockTeamId, mockNow);
      expect(activeJobs).toContain(mockJob.id);

      // Remove from active jobs
      await removeConcurrencyLimitActiveJob(mockTeamId, mockJob.id);
      expect(redisConnection.zrem).toHaveBeenCalled();
    });
  });
}); 