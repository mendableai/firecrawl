import request from "supertest";
import { app } from "../../index";
import dotenv from "dotenv";

dotenv.config();

// const TEST_URL = 'http://localhost:3002'
const TEST_URL = "http://127.0.0.1:3002";


  describe.only("E2E Tests for API Routes", () => {
    beforeAll(() => {
      process.env.USE_DB_AUTHENTICATION = "true";
    });

    afterAll(() => {
      delete process.env.USE_DB_AUTHENTICATION;
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

    describe("POST /v0/scrape", () => {
      it("should require authorization", async () => {
        const response = await request(app).post("/v0/scrape");
        expect(response.statusCode).toBe(401);
      });

      it("should return an error response with an invalid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/scrape")
          .set("Authorization", `Bearer invalid-api-key`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(401);
      });

      it("should return an error for a blocklisted URL", async () => {
        const blocklistedUrl = "https://facebook.com/fake-test";
        const response = await request(TEST_URL)
          .post("/v0/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ url: blocklistedUrl });
        expect(response.statusCode).toBe(403);
        expect(response.body.error).toContain("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
      });

      it("should return a successful response with a valid preview token", async () => {
        const response = await request(TEST_URL)
          .post("/v0/scrape")
          .set("Authorization", `Bearer this_is_just_a_preview_token`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(200);
      }, 10000); // 10 seconds timeout

      it("should return a successful response with a valid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(response.body.data).toHaveProperty("content");
        expect(response.body.data).toHaveProperty("markdown");
        expect(response.body.data).toHaveProperty("metadata");
        expect(response.body.data.content).toContain("🔥 FireCrawl");
      }, 30000); // 30 seconds timeout
    });

    describe("POST /v0/crawl", () => {
      it("should require authorization", async () => {
        const response = await request(TEST_URL).post("/v0/crawl");
        expect(response.statusCode).toBe(401);
      });

      it("should return an error response with an invalid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/crawl")
          .set("Authorization", `Bearer invalid-api-key`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(401);
      });

      it("should return an error for a blocklisted URL", async () => {
        const blocklistedUrl = "https://twitter.com/fake-test";
        const response = await request(TEST_URL)
          .post("/v0/crawl")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ url: blocklistedUrl });
        expect(response.statusCode).toBe(403);
        expect(response.body.error).toContain("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
      });

      it("should return a successful response with a valid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/crawl")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("jobId");
        expect(response.body.jobId).toMatch(
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
        );
      });


      // Additional tests for insufficient credits?
    });

    describe("POST /v0/crawlWebsitePreview", () => {
      it("should require authorization", async () => {
        const response = await request(TEST_URL).post(
          "/v0/crawlWebsitePreview"
        );
        expect(response.statusCode).toBe(401);
      });

      it("should return an error response with an invalid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/crawlWebsitePreview")
          .set("Authorization", `Bearer invalid-api-key`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(401);
      });

      it("should return an error for a blocklisted URL", async () => {
        const blocklistedUrl = "https://instagram.com/fake-test";
        const response = await request(TEST_URL)
          .post("/v0/crawlWebsitePreview")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ url: blocklistedUrl });
        expect(response.statusCode).toBe(403);
        expect(response.body.error).toContain("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
      });

      it("should return a successful response with a valid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/crawlWebsitePreview")
          .set("Authorization", `Bearer this_is_just_a_preview_token`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("jobId");
        expect(response.body.jobId).toMatch(
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
        );
      });
    });

    describe("POST /v0/search", () => {
      it("should require authorization", async () => {
        const response = await request(TEST_URL).post("/v0/search");
        expect(response.statusCode).toBe(401);
      });

      it("should return an error response with an invalid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/search")
          .set("Authorization", `Bearer invalid-api-key`)
          .set("Content-Type", "application/json")
          .send({ query: "test" });
        expect(response.statusCode).toBe(401);
      });


      
      it("should return a successful response with a valid API key", async () => {
        const response = await request(TEST_URL)
          .post("/v0/search")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ query: "test" });
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("success");
        expect(response.body.success).toBe(true);
        expect(response.body).toHaveProperty("data");
      }, 30000); // 30 seconds timeout
    });

    describe("GET /v0/crawl/status/:jobId", () => {
      it("should require authorization", async () => {
        const response = await request(TEST_URL).get("/v0/crawl/status/123");
        expect(response.statusCode).toBe(401);
      });

      it("should return an error response with an invalid API key", async () => {
        const response = await request(TEST_URL)
          .get("/v0/crawl/status/123")
          .set("Authorization", `Bearer invalid-api-key`);
        expect(response.statusCode).toBe(401);
      });

      it("should return Job not found for invalid job ID", async () => {
        const response = await request(TEST_URL)
          .get("/v0/crawl/status/invalidJobId")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
        expect(response.statusCode).toBe(404);
      });

      it("should return a successful response for a valid crawl job", async () => {
        const crawlResponse = await request(TEST_URL)
          .post("/v0/crawl")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev" });
        expect(crawlResponse.statusCode).toBe(200);

        const response = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("status");
        expect(response.body.status).toBe("active");

        // wait for 30 seconds
        await new Promise((r) => setTimeout(r, 30000));

        const completedResponse = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
        expect(completedResponse.statusCode).toBe(200);
        expect(completedResponse.body).toHaveProperty("status");
        expect(completedResponse.body.status).toBe("completed");
        expect(completedResponse.body).toHaveProperty("data");
        expect(completedResponse.body.data[0]).toHaveProperty("content");
        expect(completedResponse.body.data[0]).toHaveProperty("markdown");
        expect(completedResponse.body.data[0]).toHaveProperty("metadata");
        expect(completedResponse.body.data[0].content).toContain(
          "🔥 FireCrawl"
        );
      }, 60000); // 60 seconds
    });

    describe("POST /v0/scrape with LLM Extraction", () => {
      it("should extract data using LLM extraction mode", async () => {
        const response = await request(TEST_URL)
          .post("/v0/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({
            url: "https://mendable.ai",
            pageOptions: {
              onlyMainContent: true
            },
            extractorOptions: {
              extractorMode: "llm-extract",
              extractor_prompt: "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source",
              extractorSchema: {
                type: "object",
                properties: {
                  company_mission: {
                    type: "string"
                  },
                  supports_sso: {
                    type: "boolean"
                  },
                  is_open_source: {
                    type: "boolean"
                  }
                },
                required: ["company_mission", "supports_sso", "is_open_source"]
              }
            }
          });
  
        console.log("Response:", response.body);
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(response.body.data).toHaveProperty("company_mission");
        expect(response.body.data).toHaveProperty("supports_sso");
        expect(response.body.data).toHaveProperty("is_open_source");
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
