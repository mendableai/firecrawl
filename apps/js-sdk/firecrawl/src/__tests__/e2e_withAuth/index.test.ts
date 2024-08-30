import FirecrawlApp, {
  CrawlResponseV0,
  CrawlStatusResponse,
  CrawlStatusResponseV0,
  FirecrawlDocumentV0,
  ScrapeResponseV0,
  SearchResponseV0,
} from "../../index";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { describe, test, expect } from "@jest/globals";

dotenv.config();

const TEST_API_KEY = process.env.TEST_API_KEY;
const API_URL = "http://127.0.0.1:3002";

describe('FirecrawlApp<"v0"> E2E Tests', () => {
  test.concurrent("should throw error for no API key", async () => {
    expect(() => {
      new FirecrawlApp<"v0">({ apiKey: null, apiUrl: API_URL, version: "v0" });
    }).toThrow("No API key provided");
  });

  test.concurrent(
    "should throw error for invalid API key on scrape",
    async () => {
      const invalidApp = new FirecrawlApp<"v0">({
        apiKey: "invalid_api_key",
        apiUrl: API_URL,
        version: "v0",
      });
      await expect(
        invalidApp.scrapeUrl("https://roastmywebsite.ai")
      ).rejects.toThrow("Request failed with status code 401");
    }
  );

  test.concurrent(
    "should throw error for blocklisted URL on scrape",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const blocklistedUrl = "https://facebook.com/fake-test";
      await expect(app.scrapeUrl(blocklistedUrl)).rejects.toThrow(
        "Request failed with status code 403"
      );
    }
  );

  test.concurrent(
    "should return successful response with valid preview token",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: "this_is_just_a_preview_token",
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.scrapeUrl(
        "https://roastmywebsite.ai"
      )) as ScrapeResponseV0;
      expect(response).not.toBeNull();
      expect(response.data?.content).toContain("_Roast_");
    },
    30000
  ); // 30 seconds timeout

  test.concurrent(
    "should return successful response for valid scrape",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.scrapeUrl(
        "https://roastmywebsite.ai"
      )) as ScrapeResponseV0;
      expect(response).not.toBeNull();
      expect(response.data?.content).toContain("_Roast_");
      expect(response.data).toHaveProperty("markdown");
      expect(response.data).toHaveProperty("metadata");
      expect(response.data).not.toHaveProperty("html");
    },
    30000
  ); // 30 seconds timeout

  test.concurrent(
    "should return successful response with valid API key and include HTML",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.scrapeUrl("https://roastmywebsite.ai", {
        pageOptions: { includeHtml: true },
      })) as ScrapeResponseV0;
      expect(response).not.toBeNull();
      expect(response.data?.content).toContain("_Roast_");
      expect(response.data?.markdown).toContain("_Roast_");
      expect(response.data?.html).toContain("<h1");
    },
    30000
  ); // 30 seconds timeout

  test.concurrent(
    "should return successful response for valid scrape with PDF file",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.scrapeUrl(
        "https://arxiv.org/pdf/astro-ph/9301001.pdf"
      )) as ScrapeResponseV0;
      expect(response).not.toBeNull();
      expect(response.data?.content).toContain(
        "We present spectrophotometric observations of the Broad Line Radio Galaxy"
      );
    },
    30000
  ); // 30 seconds timeout

  test.concurrent(
    "should return successful response for valid scrape with PDF file without explicit extension",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.scrapeUrl(
        "https://arxiv.org/pdf/astro-ph/9301001"
      )) as ScrapeResponseV0;
      expect(response).not.toBeNull();
      expect(response.data?.content).toContain(
        "We present spectrophotometric observations of the Broad Line Radio Galaxy"
      );
    },
    30000
  ); // 30 seconds timeout

  test.concurrent(
    "should throw error for invalid API key on crawl",
    async () => {
      const invalidApp = new FirecrawlApp<"v0">({
        apiKey: "invalid_api_key",
        apiUrl: API_URL,
        version: "v0",
      });
      await expect(
        invalidApp.crawlUrl("https://roastmywebsite.ai")
      ).rejects.toThrow("Request failed with status code 401");
    }
  );

  test.concurrent(
    "should throw error for blocklisted URL on crawl",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const blocklistedUrl = "https://twitter.com/fake-test";
      await expect(app.crawlUrl(blocklistedUrl)).rejects.toThrow(
        "Request failed with status code 403"
      );
    }
  );

  test.concurrent(
    "should return successful response for crawl and wait for completion",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.crawlUrl(
        "https://roastmywebsite.ai",
        { crawlerOptions: { excludes: ["blog/*"] } },
        true,
        10
      )) as FirecrawlDocumentV0[];
      expect(response).not.toBeNull();
      expect(response[0].content).toContain("_Roast_");
    },
    60000
  ); // 60 seconds timeout

  test.concurrent("should handle idempotency key for crawl", async () => {
    const app = new FirecrawlApp<"v0">({
      apiKey: TEST_API_KEY,
      apiUrl: API_URL,
      version: "v0",
    });
    const uniqueIdempotencyKey = uuidv4();
    const response = (await app.crawlUrl(
      "https://roastmywebsite.ai",
      { crawlerOptions: { excludes: ["blog/*"] } },
      false,
      2,
      uniqueIdempotencyKey
    )) as CrawlResponseV0;
    expect(response).not.toBeNull();
    expect(response.jobId).toBeDefined();

    await expect(
      app.crawlUrl(
        "https://roastmywebsite.ai",
        { crawlerOptions: { excludes: ["blog/*"] } },
        true,
        2,
        uniqueIdempotencyKey
      )
    ).rejects.toThrow("Request failed with status code 409");
  });

  test.concurrent(
    "should check crawl status",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response: any = (await app.crawlUrl(
        "https://roastmywebsite.ai",
        { crawlerOptions: { excludes: ["blog/*"] } },
        false
      )) as CrawlResponseV0;
      expect(response).not.toBeNull();
      expect(response.jobId).toBeDefined();

      let statusResponse = await app.checkCrawlStatus(response.jobId);
      const maxChecks = 15;
      let checks = 0;

      while (statusResponse.status === "active" && checks < maxChecks) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        expect(statusResponse.partial_data).not.toBeNull();
        // expect(statusResponse.current).toBeGreaterThanOrEqual(1);
        statusResponse = (await app.checkCrawlStatus(
          response.jobId
        )) as CrawlStatusResponseV0;
        checks++;
      }

      expect(statusResponse).not.toBeNull();
      expect(statusResponse.success).toBe(true);
      expect(statusResponse.status).toBe("completed");
      expect(statusResponse.total).toEqual(statusResponse.current);
      expect(statusResponse.current_step).not.toBeNull();
      expect(statusResponse.current).toBeGreaterThanOrEqual(1);

      expect(statusResponse?.data?.length).toBeGreaterThan(0);
    },
    35000
  ); // 35 seconds timeout

  test.concurrent(
    "should return successful response for search",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.search("test query")) as SearchResponseV0;
      expect(response).not.toBeNull();
      expect(response?.data?.[0]?.content).toBeDefined();
      expect(response?.data?.length).toBeGreaterThan(2);
    },
    30000
  ); // 30 seconds timeout

  test.concurrent(
    "should throw error for invalid API key on search",
    async () => {
      const invalidApp = new FirecrawlApp<"v0">({
        apiKey: "invalid_api_key",
        apiUrl: API_URL,
        version: "v0",
      });
      await expect(invalidApp.search("test query")).rejects.toThrow(
        "Request failed with status code 401"
      );
    }
  );

  test.concurrent(
    "should perform LLM extraction",
    async () => {
      const app = new FirecrawlApp<"v0">({
        apiKey: TEST_API_KEY,
        apiUrl: API_URL,
        version: "v0",
      });
      const response = (await app.scrapeUrl("https://mendable.ai", {
        extractorOptions: {
          mode: "llm-extraction",
          extractionPrompt:
            "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source",
          extractionSchema: {
            type: "object",
            properties: {
              company_mission: { type: "string" },
              supports_sso: { type: "boolean" },
              is_open_source: { type: "boolean" },
            },
            required: ["company_mission", "supports_sso", "is_open_source"],
          },
        },
      })) as ScrapeResponseV0;
      expect(response).not.toBeNull();
      expect(response.data?.llm_extraction).toBeDefined();
      const llmExtraction = response.data?.llm_extraction;
      expect(llmExtraction?.company_mission).toBeDefined();
      expect(typeof llmExtraction?.supports_sso).toBe("boolean");
      expect(typeof llmExtraction?.is_open_source).toBe("boolean");
    },
    30000
  ); // 30 seconds timeout
});
