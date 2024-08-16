import request from "supertest";
import dotenv from "dotenv";
import {
  ScrapeOptions,
  ScrapeRequest,
  ScrapeResponseRequestTest,
} from "../../controllers/v1/types";

dotenv.config();
const TEST_URL = "http://127.0.0.1:3002";

describe("E2E Tests for v1 API Routes", () => {
  beforeAll(() => {
    process.env.USE_DB_AUTHENTICATION = "true";
  });

  afterAll(() => {
    delete process.env.USE_DB_AUTHENTICATION;
  });

  describe("GET /is-production", () => {
    it.concurrent("should return the production status", async () => {
      const response: ScrapeResponseRequestTest = await request(TEST_URL).get(
        "/is-production"
      );
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("isProduction");
    });
  });

  describe("POST /v1/scrape", () => {
    it.concurrent("should require authorization", async () => {
      const response: ScrapeResponseRequestTest = await request(TEST_URL).post(
        "/v1/scrape"
      );
      expect(response.statusCode).toBe(401);
    });

    it.concurrent(
      "should return an error response with an invalid API key",
      async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post("/v1/scrape")
          .set("Authorization", `Bearer invalid-api-key`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(401);
      }
    );

    it.concurrent(
      "should return a successful response with a valid API key",
      async () => {
        const scrapeRequest: ScrapeRequest = {
          url: "https://roastmywebsite.ai",
        };

        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post("/v1/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send(scrapeRequest);

        expect(response.statusCode).toBe(200);

        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).not.toHaveProperty("content");
        expect(response.body.data).toHaveProperty("markdown");
        expect(response.body.data).toHaveProperty("metadata");
        expect(response.body.data).not.toHaveProperty("html");
        expect(response.body.data.markdown).toContain("_Roast_");
        expect(response.body.data.metadata.error).toBeUndefined();
        expect(response.body.data.metadata.title).toBe("Roast My Website");
        expect(response.body.data.metadata.description).toBe(
          "Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️"
        );
        expect(response.body.data.metadata.keywords).toBe(
          "Roast My Website,Roast,Website,GitHub,Firecrawl"
        );
        expect(response.body.data.metadata.robots).toBe("follow, index");
        expect(response.body.data.metadata.ogTitle).toBe("Roast My Website");
        expect(response.body.data.metadata.ogDescription).toBe(
          "Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️"
        );
        expect(response.body.data.metadata.ogUrl).toBe(
          "https://www.roastmywebsite.ai"
        );
        expect(response.body.data.metadata.ogImage).toBe(
          "https://www.roastmywebsite.ai/og.png"
        );
        expect(response.body.data.metadata.ogLocaleAlternate).toStrictEqual([]);
        expect(response.body.data.metadata.ogSiteName).toBe("Roast My Website");
        expect(response.body.data.metadata.sourceURL).toBe(
          "https://roastmywebsite.ai"
        );
        expect(response.body.data.metadata.statusCode).toBe(200);
      },
      30000
    ); // 30 seconds timeout
    it.concurrent(
      "should return a successful response with a valid API key and includeHtml set to true",
      async () => {
        const scrapeRequest: ScrapeRequest = {
          url: "https://roastmywebsite.ai",
          formats: ["markdown", "html"],
        };

        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post("/v1/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send(scrapeRequest);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("data");
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty("markdown");
        expect(response.body.data).toHaveProperty("html");
        expect(response.body.data).toHaveProperty("metadata");
        expect(response.body.data.markdown).toContain("_Roast_");
        expect(response.body.data.html).toContain("<h1");
        expect(response.body.data.metadata.statusCode).toBe(200);
        expect(response.body.data.metadata.error).toBeUndefined();
      },
      30000
    );
  });
});
