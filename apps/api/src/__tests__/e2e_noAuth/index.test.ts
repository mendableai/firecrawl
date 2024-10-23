import request from "supertest";
import dotenv from "dotenv";
const fs = require("fs");
const path = require("path");

dotenv.config();

const TEST_URL = "http://127.0.0.1:3002";

describe("E2E Tests for API Routes with No Authentication", () => {
  let originalEnv: NodeJS.ProcessEnv;

  // save original process.env
  beforeAll(() => {
    originalEnv = { ...process.env };
    process.env.SUPABASE_ANON_TOKEN = "";
    process.env.SUPABASE_SERVICE_TOKEN = "";
    process.env.SCRAPING_BEE_API_KEY = "";
    process.env.BULL_AUTH_KEY = "";
    process.env.LOGTAIL_KEY = "";
    process.env.PLAYWRIGHT_MICROSERVICE_URL = "";
    process.env.LLAMAPARSE_API_KEY = "";
    process.env.TEST_API_KEY = "";
  });

  // restore original process.env
  afterAll(() => {
    process.env = originalEnv;
  });


  describe("GET /", () => {
    it("should return Hello, world! message", async () => {
      const response = await request(TEST_URL).get("/");
      expect(response.statusCode).toBe(200);
      expect(response.text).toContain("SCRAPERS-JS: Hello, world! Fly.io");
    });
  });

  describe("GET /test", () => {
    it("should return Hello, world! message", async () => {
      const response = await request(TEST_URL).get("/test");
      expect(response.statusCode).toBe(200);
      expect(response.text).toContain("Hello, world!");
    });
  });

  describe("GET /is-production", () => {
    it("should return the production status", async () => {
      const response = await request(TEST_URL).get("/is-production");
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("isProduction");
    });
  });
});
