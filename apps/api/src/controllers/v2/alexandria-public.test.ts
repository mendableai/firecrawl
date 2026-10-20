import express from "express";
import request from "supertest";
const mocks = vi.hoisted(() => ({
  config: {
    ALEXANDRIA_PUBLIC_RESULTS_ENABLED: true,
    ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS: [] as string[],
  },
  load: vi.fn(),
  consume: vi.fn(),
}));
vi.mock("../../config", () => ({ config: mocks.config }));
vi.mock("../../services/alexandria/public-results", () => ({
  loadPublicResult: mocks.load,
}));
vi.mock("../../services/rate-limiter", () => ({ redisRateLimitClient: {} }));
vi.mock("rate-limiter-flexible", async importOriginal => {
  const actual = await importOriginal<typeof import("rate-limiter-flexible")>();
  return {
    ...actual,
    RateLimiterRedis: class {
      consume = mocks.consume;
    },
  };
});
import { RateLimiterRes } from "rate-limiter-flexible";
import {
  alexandriaPublicRateLimit,
  alexandriaPublicResultController,
} from "./alexandria-public";

const app = express();
app.get(
  "/v2/alexandria/public/:jobId",
  alexandriaPublicRateLimit,
  (req, res, next) =>
    alexandriaPublicResultController(req as any, res).catch(next),
);

const jobId = "01a15270-ca7a-76bf-858e-53381c7a86f1";
const record = {
  jobId,
  provider: "espn-com",
  capability: "sports-data/scoreboard",
  createdVia: "chatgpt",
  fetchedAt: "2026-10-19T04:20:00.000Z",
  params: { sport: "football", league: "nfl" },
  payload: { count: 1, events: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_ENABLED = true;
  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS = [];
  mocks.consume.mockResolvedValue(undefined);
});

it("serves a stored record without team details, CDN-cacheable", async () => {
  mocks.load.mockResolvedValue({ ...record, teamId: "should-not-leak" });
  const response = await request(app).get(`/v2/alexandria/public/${jobId}`);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ success: true, data: record });
  expect(response.headers["cache-control"]).toBe(
    "public, max-age=60, s-maxage=300",
  );
  expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  expect(mocks.load).toHaveBeenCalledWith(jobId);
});

it("answers 404 for an unknown job", async () => {
  mocks.load.mockResolvedValue(null);
  const response = await request(app).get(`/v2/alexandria/public/${jobId}`);
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ success: false, error: "not_found" });
  expect(response.headers["cache-control"]).toBe("no-store");
});

it("rejects an id that is not a UUID without reading storage", async () => {
  const response = await request(app).get("/v2/alexandria/public/not-a-uuid");
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ success: false, error: "invalid_job_id" });
  expect(mocks.load).not.toHaveBeenCalled();
});

it("hides a stored record once its provider or the feature is switched off", async () => {
  mocks.load.mockResolvedValue(record);
  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS = ["espn-com"];
  const disabled = await request(app).get(`/v2/alexandria/public/${jobId}`);
  expect(disabled.status).toBe(404);
  expect(disabled.body).toEqual({ success: false, error: "not_found" });

  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS = [];
  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_ENABLED = false;
  expect(
    (await request(app).get(`/v2/alexandria/public/${jobId}`)).status,
  ).toBe(404);

  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_ENABLED = true;
  mocks.load.mockResolvedValue({ ...record, capability: "sports-data/search" });
  expect(
    (await request(app).get(`/v2/alexandria/public/${jobId}`)).status,
  ).toBe(404);
});

it("rate limits per IP and fails open when the limiter is unavailable", async () => {
  mocks.consume.mockRejectedValueOnce(new RateLimiterRes(0, 30_000));
  const limited = await request(app).get(`/v2/alexandria/public/${jobId}`);
  expect(limited.status).toBe(429);
  expect(limited.headers["retry-after"]).toBe("30");
  expect(mocks.load).not.toHaveBeenCalled();

  mocks.consume.mockRejectedValueOnce(new Error("redis down"));
  mocks.load.mockResolvedValue(record);
  expect(
    (await request(app).get(`/v2/alexandria/public/${jobId}`)).status,
  ).toBe(200);
});
