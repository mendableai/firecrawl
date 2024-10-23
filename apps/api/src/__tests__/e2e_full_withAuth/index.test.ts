import request from "supertest";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// const TEST_URL = 'http://localhost:3002'
const TEST_URL = "http://127.0.0.1:3002";

describe("E2E Tests for API Routes", () => {
  describe("GET /", () => {
    it.concurrent("should return Hello, world! message", async () => {
      const response = await request(TEST_URL).get("/");

      expect(response.statusCode).toBe(200);
      expect(response.text).toContain("SCRAPERS-JS: Hello, world! Fly.io");
    });
  });

  describe("GET /test", () => {
    it.concurrent("should return Hello, world! message", async () => {
      const response = await request(TEST_URL).get("/test");
      expect(response.statusCode).toBe(200);
      expect(response.text).toContain("Hello, world!");
    });
  });

  describe("GET /is-production", () => {
    it.concurrent("should return the production status", async () => {
      const response = await request(TEST_URL).get("/is-production");
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("isProduction");
    });
  });
});
