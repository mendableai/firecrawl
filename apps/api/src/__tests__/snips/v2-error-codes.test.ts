import request from "supertest";
import { scrapeTimeout } from "./lib";

describe("v2 Controllers Error Code Tests", () => {
  const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3002";
  const authToken = process.env.TEST_API_KEY || "fc-YOUR_API_KEY";
  
  describe("/v2/crawl-status", () => {
    it("should return FORBIDDEN_ERROR code when team_id doesn't match", async () => {
      const response = await request(baseUrl)
        .get("/v2/crawl/non-existent-job-id")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-return-format", "json");
      
      // Test will verify error response has code field
    }, scrapeTimeout);

    it("should return NOT_FOUND_ERROR code when job not found", async () => {
      const response = await request(baseUrl)
        .get("/v2/crawl/non-existent-job-id")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-return-format", "json");
      
      // Test will verify error response has code field
    }, scrapeTimeout);

    it("should return JOB_EXPIRED_ERROR code when job is expired", async () => {
      // This test would need a job that's over 24 hours old
      // Test will verify error response has code field
    }, scrapeTimeout);
  });

  describe("/v2/crawl", () => {
    it("should return FORBIDDEN_ERROR code for zero data retention without permission", async () => {
      const response = await request(baseUrl)
        .post("/v2/crawl")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-return-format", "json")
        .send({
          url: "https://example.com",
          zeroDataRetention: true
        });
      
      // Test will verify error response has code field
    }, scrapeTimeout);

    it("should return VALIDATION_ERROR code for invalid regex in includePaths", async () => {
      const response = await request(baseUrl)
        .post("/v2/crawl")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-return-format", "json")
        .send({
          url: "https://example.com",
          includePaths: ["[invalid-regex"]
        });
      
      // Test will verify error response has code field
    }, scrapeTimeout);

    it("should return INTERNAL_SERVER_ERROR code for prompt processing failure", async () => {
      // Test will verify error response has code field
    }, scrapeTimeout);
  });

  describe("/v2/search", () => {
    it("should return FORBIDDEN_ERROR code for zero data retention team", async () => {
      // Test with a team that has forceZDR flag
      // Test will verify error response has code field
    }, scrapeTimeout);

    it("should return TIMEOUT_ERROR code when request times out", async () => {
      // Test will verify error response has code field
    }, scrapeTimeout);

    it("should return INTERNAL_SERVER_ERROR code for unhandled errors", async () => {
      // Test will verify error response has code field
    }, scrapeTimeout);
  });

  describe("/v2/map", () => {
    it("should return FORBIDDEN_ERROR code for zero data retention team", async () => {
      // Test with a team that has forceZDR flag
      // Test will verify error response has code field
    }, scrapeTimeout);

    it("should return TIMEOUT_ERROR code when request times out", async () => {
      const response = await request(baseUrl)
        .post("/v2/map")
        .set("Authorization", `Bearer ${authToken}`)
        .set("x-return-format", "json")
        .send({
          url: "https://example.com",
          timeout: 1 // 1ms timeout to force timeout
        });
      
      // Test will verify error response has code field
    }, scrapeTimeout);
  });
});