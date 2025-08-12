/**
 * E2E tests for v2 batch scrape (translated from Python tests)
 */
import Firecrawl from "../../../index";
import { config } from "dotenv";
import { describe, test, expect } from "@jest/globals";

config();

const API_KEY = process.env.FIRECRAWL_API_KEY ?? "";
const API_URL = process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev";

const client = new Firecrawl({ apiKey: API_KEY, apiUrl: API_URL });

describe("v2.batch e2e", () => {
  test("batch scrape minimal (wait)", async () => {
    const urls = [
      "https://docs.firecrawl.dev",
      "https://firecrawl.dev",
    ];
    const job = await client.batchScrape(urls, { options: { formats: ["markdown"] }, pollInterval: 1, timeout: 180 });
    expect(["completed", "failed"]).toContain(job.status);
    expect(job.completed).toBeGreaterThanOrEqual(0);
    expect(job.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(job.data)).toBe(true);
  }, 240_000);

  test("start batch minimal and status", async () => {
    const urls = ["https://docs.firecrawl.dev", "https://firecrawl.dev"]; 
    const start = await client.startBatchScrape(urls, { options: { formats: ["markdown"] }, ignoreInvalidURLs: true });
    expect(typeof start.id).toBe("string");
    expect(typeof start.url).toBe("string");
    const status = await client.getBatchScrapeStatus(start.id);
    expect(["scraping", "completed", "failed", "cancelled"]).toContain(status.status);
    expect(status.total).toBeGreaterThanOrEqual(0);
  }, 120_000);

  test("wait batch with all params", async () => {
    const urls = ["https://docs.firecrawl.dev", "https://firecrawl.dev"]; 
    const job = await client.batchScrape(urls, {
      options: {
        formats: [
          "markdown",
          { type: "json", prompt: "Extract page title", schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
          { type: "changeTracking", prompt: "Track changes", modes: ["json"] },
        ],
        onlyMainContent: true,
        mobile: false,
      },
      ignoreInvalidURLs: true,
      maxConcurrency: 2,
      zeroDataRetention: false,
      pollInterval: 1,
      timeout: 180,
    });
    expect(["completed", "failed", "cancelled"]).toContain(job.status);
    expect(job.completed).toBeGreaterThanOrEqual(0);
    expect(job.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(job.data)).toBe(true);
  }, 300_000);

  test("cancel batch", async () => {
    const urls = ["https://docs.firecrawl.dev", "https://firecrawl.dev"]; 
    const start = await client.startBatchScrape(urls, { options: { formats: ["markdown"] }, maxConcurrency: 1 });
    expect(typeof start.id).toBe("string");
    const cancelled = await client.cancelBatchScrape(start.id);
    expect(cancelled).toBe(true);
  }, 120_000);
});

