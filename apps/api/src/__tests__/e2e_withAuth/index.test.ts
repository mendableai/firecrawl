import request from "supertest";
import dotenv from "dotenv";
import {
  FirecrawlCrawlResponse,
  FirecrawlCrawlStatusResponse,
  FirecrawlScrapeResponse,
} from "../../types";

dotenv.config();
const TEST_URL = "http://127.0.0.1:3002";

describe("E2E Tests for v0 API Routes", () => {
  describe("GET /is-production", () => {
    it.concurrent("should return the production status", async () => {
      const response = await request(TEST_URL).get("/is-production");
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("isProduction");
    });
  });
});
