import request from "supertest";
import { Identity, idmux, scrapeTimeout } from "./lib";
import crypto from "crypto";

const TEST_URL = process.env.TEST_URL || "http://127.0.0.1:3002";

describe("V2 Scrape Default maxAge", () => {
  if (!process.env.TEST_SUITE_SELF_HOSTED) {
    let identity: Identity;

    beforeAll(async () => {
      identity = await idmux({
        name: "v2-scrape-default-maxage",
        concurrency: 100,
        credits: 1000000,
      });
    }, 10000);

    test("should use default maxAge of 4 hours when not specified", async () => {
      const id = crypto.randomUUID();
      const url = "https://firecrawl.dev/?testId=" + id;
      
      // First scrape to populate cache
      const response1 = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url,
          timeout: scrapeTimeout,
        });

      expect(response1.status).toBe(200);
      expect(response1.body.success).toBe(true);
      expect(response1.body.data).toBeDefined();
      expect(response1.body.data.metadata.cacheState).toBe("miss");

      // Wait for index to be populated
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Second scrape should hit cache with default maxAge
      const response2 = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url,
          timeout: scrapeTimeout,
        });

      expect(response2.status).toBe(200);
      expect(response2.body.success).toBe(true);
      expect(response2.body.data).toBeDefined();
      expect(response2.body.data.metadata.cacheState).toBe("hit");
      expect(response2.body.data.metadata.cachedAt).toBeDefined();
    }, scrapeTimeout * 2 + 20000);

    test("should respect explicitly set maxAge of 0", async () => {
      const id = crypto.randomUUID();
      const url = "https://firecrawl.dev/?testId=" + id;
      
      // First scrape to populate cache
      const response1 = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url,
          timeout: scrapeTimeout,
        });

      expect(response1.status).toBe(200);
      expect(response1.body.success).toBe(true);
      expect(response1.body.data).toBeDefined();
      expect(response1.body.data.metadata.cacheState).toBe("miss");

      // Wait for index to be populated
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Second scrape with maxAge=0 should miss cache
      const response2 = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url,
          timeout: scrapeTimeout,
          maxAge: 0,
        });

      expect(response2.status).toBe(200);
      expect(response2.body.success).toBe(true);
      expect(response2.body.data).toBeDefined();
      expect(response2.body.data.metadata.cacheState).toBeUndefined();
    }, scrapeTimeout * 2 + 20000);

    test("should respect custom maxAge value", async () => {
      const id = crypto.randomUUID();
      const url = "https://firecrawl.dev/?testId=" + id;
      
      // First scrape to populate cache
      const response1 = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url,
          timeout: scrapeTimeout,
          maxAge: 3600000, // 1 hour in milliseconds
        });

      expect(response1.status).toBe(200);
      expect(response1.body.success).toBe(true);
      expect(response1.body.data).toBeDefined();
      expect(response1.body.data.metadata.cacheState).toBe("miss");

      // Wait for index to be populated
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Second scrape with same maxAge should hit cache
      const response2 = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url,
          timeout: scrapeTimeout,
          maxAge: 3600000, // 1 hour in milliseconds
        });

      expect(response2.status).toBe(200);
      expect(response2.body.success).toBe(true);
      expect(response2.body.data).toBeDefined();
      expect(response2.body.data.metadata.cacheState).toBe("hit");
      expect(response2.body.data.metadata.cachedAt).toBeDefined();
    }, scrapeTimeout * 2 + 20000);
  } else {
    it("mocked", () => {
      expect(true).toBe(true);
    });
  }
});