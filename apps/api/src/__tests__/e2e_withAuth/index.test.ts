import request from "supertest";
import { app } from "../../index";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// const TEST_URL = 'http://localhost:3002'
const TEST_URL = "http://127.0.0.1:3002";

describe("E2E Tests for API Routes", () => {
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
      expect(response.body.error).toContain(
        "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it."
      );
    });

    it("should return a successful response with a valid preview token", async () => {
      const response = await request(TEST_URL)
        .post("/v0/scrape")
        .set("Authorization", `Bearer this_is_just_a_preview_token`)
        .set("Content-Type", "application/json")
        .send({ url: "https://roastmywebsite.ai" });
      expect(response.statusCode).toBe(200);
    }, 30000); // 30 seconds timeout

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
      expect(response.body.data).not.toHaveProperty("html");
      expect(response.body.data.content).toContain("🔥 Firecrawl");
    }, 30000); // 30 seconds timeout

    it("should return a successful response with a valid API key and includeHtml set to true", async () => {
      const response = await request(TEST_URL)
        .post("/v0/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://firecrawl.dev",
          pageOptions: { includeHtml: true },
        });
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("content");
      expect(response.body.data).toHaveProperty("markdown");
      expect(response.body.data).toHaveProperty("html");
      expect(response.body.data).toHaveProperty("metadata");
      expect(response.body.data.content).toContain("🔥 Firecrawl");
      expect(response.body.data.markdown).toContain("🔥 Firecrawl");
      expect(response.body.data.html).toContain("<h1");
    }, 30000); // 30 seconds timeout
    
   it('should return a successful response for a valid scrape with PDF file', async () => {
      const response = await request(TEST_URL)
        .post('/v0/scrape')
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://arxiv.org/pdf/astro-ph/9301001.pdf' });
      await new Promise((r) => setTimeout(r, 6000));

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('content');
      expect(response.body.data).toHaveProperty('metadata');
      expect(response.body.data.content).toContain('We present spectrophotometric observations of the Broad Line Radio Galaxy');
    }, 60000); // 60 seconds
  
    it('should return a successful response for a valid scrape with PDF file without explicit .pdf extension', async () => {
      const response = await request(TEST_URL)
        .post('/v0/scrape')
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://arxiv.org/pdf/astro-ph/9301001' });
      await new Promise((r) => setTimeout(r, 6000));

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('content');
      expect(response.body.data).toHaveProperty('metadata');
      expect(response.body.data.content).toContain('We present spectrophotometric observations of the Broad Line Radio Galaxy');
    }, 60000); // 60 seconds

    // TODO: add this test back once we nail the waitFor option to be more deterministic
    // it("should return a successful response with a valid API key and waitFor option", async () => {
    //   const startTime = Date.now();
    //   const response = await request(TEST_URL)
    //     .post("/v0/scrape")
    //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    //     .set("Content-Type", "application/json")
    //     .send({ url: "https://firecrawl.dev", pageOptions: { waitFor: 7000 } });
    //   const endTime = Date.now();
    //   const duration = endTime - startTime;

    //   expect(response.statusCode).toBe(200);
    //   expect(response.body).toHaveProperty("data");
    //   expect(response.body.data).toHaveProperty("content");
    //   expect(response.body.data).toHaveProperty("markdown");
    //   expect(response.body.data).toHaveProperty("metadata");
    //   expect(response.body.data).not.toHaveProperty("html");
    //   expect(response.body.data.content).toContain("🔥 Firecrawl");
    //   expect(duration).toBeGreaterThanOrEqual(7000);
    // }, 12000); // 12 seconds timeout
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
      expect(response.body.error).toContain(
        "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it."
      );
    });

    it("should return a successful response with a valid API key for crawl", async () => {
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
    it('should prevent duplicate requests using the same idempotency key', async () => {
      const uniqueIdempotencyKey = uuidv4();
  
      // First request with the idempotency key
      const firstResponse = await request(TEST_URL)
        .post('/v0/crawl')
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .set("x-idempotency-key", uniqueIdempotencyKey)
        .send({ url: 'https://mendable.ai' });
  
        expect(firstResponse.statusCode).toBe(200);
  
      // Second request with the same idempotency key
      const secondResponse = await request(TEST_URL)
        .post('/v0/crawl')
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .set("x-idempotency-key", uniqueIdempotencyKey)
        .send({ url: 'https://mendable.ai' });
  
      expect(secondResponse.statusCode).toBe(409);
      expect(secondResponse.body.error).toBe('Idempotency key already used');
    });

    it("should return a successful response with a valid API key and valid includes option", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://mendable.ai",
          limit: 10,
          crawlerOptions: {
            includes: ["blog/*"],
          },
        });
      
        let response;
        let isFinished = false;

        while (!isFinished) {
          response = await request(TEST_URL)
            .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
            .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);

          expect(response.statusCode).toBe(200);
          expect(response.body).toHaveProperty("status");
          isFinished = response.body.status === "completed";

          if (!isFinished) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
          }
        }

        const completedResponse = response;

        const urls = completedResponse.body.data.map(
        (item: any) => item.metadata?.sourceURL
      );
      expect(urls.length).toBeGreaterThan(5);
      urls.forEach((url: string) => {
        console.log({url})
        expect(url.startsWith("https://www.mendable.ai/blog/")).toBeTruthy();
      });
      
      expect(completedResponse.statusCode).toBe(200);
      expect(completedResponse.body).toHaveProperty("status");
      expect(completedResponse.body.status).toBe("completed");
      expect(completedResponse.body).toHaveProperty("data");
      expect(completedResponse.body.data[0]).toHaveProperty("content");
      expect(completedResponse.body.data[0]).toHaveProperty("markdown");
      expect(completedResponse.body.data[0]).toHaveProperty("metadata");
      expect(completedResponse.body.data[0].content).toContain("Mendable");
    }, 60000); // 60 seconds

    it("should return a successful response with a valid API key and valid excludes option", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://mendable.ai",
          limit: 10,
          crawlerOptions: {
            excludes: ["blog/*"],
          },
        });
      
      let isFinished = false;
      let response;

      while (!isFinished) {
        response = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("status");
        isFinished = response.body.status === "completed";

        if (!isFinished) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
        }
      }

      const completedResponse = response;

      const urls = completedResponse.body.data.map(
        (item: any) => item.metadata?.sourceURL
      );
      expect(urls.length).toBeGreaterThan(5);
      urls.forEach((url: string) => {
        expect(url.startsWith("https://wwww.mendable.ai/blog/")).toBeFalsy();
      });
    }, 90000); // 90 seconds

    it("should return a successful response with a valid API key and limit to 3", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://mendable.ai",
          crawlerOptions: { limit: 3 },
        });
      
      let isFinished = false;
      let response;

      while (!isFinished) {
        response = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("status");
        isFinished = response.body.status === "completed";

        if (!isFinished) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
        }
      }

      const completedResponse = response;

      expect(completedResponse.statusCode).toBe(200);
      expect(completedResponse.body).toHaveProperty("status");
      expect(completedResponse.body.status).toBe("completed");
      expect(completedResponse.body).toHaveProperty("data");
      expect(completedResponse.body.data.length).toBe(3);
      expect(completedResponse.body.data[0]).toHaveProperty("content");
      expect(completedResponse.body.data[0]).toHaveProperty("markdown");
      expect(completedResponse.body.data[0]).toHaveProperty("metadata");
      expect(completedResponse.body.data[0].content).toContain("Mendable");
    }, 60000); // 60 seconds
  
    it("should return a successful response with max depth option for a valid crawl job", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://www.scrapethissite.com",
          crawlerOptions: { maxDepth: 2 },
        });
      expect(crawlResponse.statusCode).toBe(200);

      const response = await request(TEST_URL)
        .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("status");
      expect(response.body.status).toBe("active");
      // wait for 60 seconds
      await new Promise((r) => setTimeout(r, 60000));
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
      const urls = completedResponse.body.data.map(
        (item: any) => item.metadata?.sourceURL
      );
      expect(urls.length).toBeGreaterThan(1);

      // Check if all URLs have a maximum depth of 1
      urls.forEach((url: string) => {
        const depth = new URL(url).pathname.split("/").filter(Boolean).length;
        expect(depth).toBeLessThanOrEqual(1);
      });
    }, 120000);

    // it("should return a successful response with a valid API key and valid limit option", async () => {
    //   const crawlResponse = await request(TEST_URL)
    //     .post("/v0/crawl")
    //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    //     .set("Content-Type", "application/json")
    //     .send({
    //       url: "https://mendable.ai",
    //       crawlerOptions: { limit: 10 },
    //     });
      
    //   const response = await request(TEST_URL)
    //     .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
    //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
    //   expect(response.statusCode).toBe(200);
    //   expect(response.body).toHaveProperty("status");
    //   expect(response.body.status).toBe("active");

    //   let isCompleted = false;
    //   while (!isCompleted) {
    //     const statusCheckResponse = await request(TEST_URL)
    //       .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
    //       .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
    //     expect(statusCheckResponse.statusCode).toBe(200);
    //     isCompleted = statusCheckResponse.body.status === "completed";
    //     if (!isCompleted) {
    //       await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
    //     }
    //   }

    //   const completedResponse = await request(TEST_URL)
    //     .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
    //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);

    //   expect(completedResponse.statusCode).toBe(200);
    //   expect(completedResponse.body).toHaveProperty("status");
    //   expect(completedResponse.body.status).toBe("completed");
    //   expect(completedResponse.body).toHaveProperty("data");
    //   expect(completedResponse.body.data.length).toBe(10);
    //   expect(completedResponse.body.data[0]).toHaveProperty("content");
    //   expect(completedResponse.body.data[0]).toHaveProperty("markdown");
    //   expect(completedResponse.body.data[0]).toHaveProperty("metadata");
    //   expect(completedResponse.body.data[0].content).toContain("Mendable");
    //   expect(completedResponse.body.data[0].content).not.toContain("main menu");
    // }, 60000); // 60 seconds

    it("should return a successful response for a valid crawl job with includeHtml set to true option", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://firecrawl.dev",
          pageOptions: { includeHtml: true },
        });
      expect(crawlResponse.statusCode).toBe(200);

      const response = await request(TEST_URL)
        .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("status");
      expect(response.body.status).toBe("active");

      let isCompleted = false;
      while (!isCompleted) {
        const statusCheckResponse = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
        expect(statusCheckResponse.statusCode).toBe(200);
        isCompleted = statusCheckResponse.body.status === "completed";
        if (!isCompleted) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
        }
      }

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

      // 120 seconds
      expect(completedResponse.body.data[0]).toHaveProperty("html");
      expect(completedResponse.body.data[0]).toHaveProperty("metadata");
      expect(completedResponse.body.data[0].content).toContain("🔥 Firecrawl");
      expect(completedResponse.body.data[0].markdown).toContain("Firecrawl");
      expect(completedResponse.body.data[0].html).toContain("<h1");
    }, 60000);
  });

  describe("POST /v0/crawlWebsitePreview", () => {
    it("should require authorization", async () => {
      const response = await request(TEST_URL).post("/v0/crawlWebsitePreview");
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

    // it("should return an error for a blocklisted URL", async () => {
    //   const blocklistedUrl = "https://instagram.com/fake-test";
    //   const response = await request(TEST_URL)
    //     .post("/v0/crawlWebsitePreview")
    //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    //     .set("Content-Type", "application/json")
    //     .send({ url: blocklistedUrl });
    // // is returning 429 instead of 403
    //   expect(response.statusCode).toBe(403);
    //   expect(response.body.error).toContain("Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.");
    // });

    it("should return a timeout error when scraping takes longer than the specified timeout", async () => {
      const response = await request(TEST_URL)
        .post("/v0/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({ url: "https://firecrawl.dev", timeout: 1000 });

      expect(response.statusCode).toBe(408);
    }, 3000); 

    it("should return a successful response with a valid API key for crawlWebsitePreview", async () => {
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

    it("should return a successful response with a valid API key for search", async () => {
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

    it("should return a successful crawl status response for a valid crawl job", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({ url: "https://firecrawl.dev" });
      expect(crawlResponse.statusCode).toBe(200);

      let isCompleted = false;
      let completedResponse;

      while (!isCompleted) {
        const response = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("status");

        if (response.body.status === "completed") {
          isCompleted = true;
          completedResponse = response;
        } else {
          await new Promise((r) => setTimeout(r, 1000)); // Wait for 1 second before checking again
        }
      }
      expect(completedResponse.body).toHaveProperty("status");
      expect(completedResponse.body.status).toBe("completed");
      expect(completedResponse.body).toHaveProperty("data");
      expect(completedResponse.body.data[0]).toHaveProperty("content");
      expect(completedResponse.body.data[0]).toHaveProperty("markdown");
      expect(completedResponse.body.data[0]).toHaveProperty("metadata");
      expect(completedResponse.body.data[0].content).toContain("🔥 Firecrawl");
    }, 60000); // 60 seconds
    
    it('should return a successful response for a valid crawl job with PDF files without explicit .pdf extension', async () => {
      const crawlResponse = await request(TEST_URL)
        .post('/v0/crawl')
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://arxiv.org/pdf/astro-ph/9301001', crawlerOptions: { limit: 10, excludes: [ 'list/*', 'login', 'abs/*', 'static/*', 'about/*', 'archive/*' ] }});
      expect(crawlResponse.statusCode).toBe(200);

      let isCompleted = false;
      let completedResponse;

      while (!isCompleted) {
        const response = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');

        if (response.body.status === 'completed') {
          isCompleted = true;
          completedResponse = response;
        } else {
          await new Promise((r) => setTimeout(r, 1000)); // Wait for 1 second before checking again
        }
      }
        expect(completedResponse.body.status).toBe('completed');
        expect(completedResponse.body).toHaveProperty('data');
        expect(completedResponse.body.data.length).toEqual(1);
        expect(completedResponse.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('asymmetries might represent, for instance, preferred source orientations to our line of sight.')
            })
          ])
        );
    }, 60000); // 60 seconds

    it("should return a successful response with max depth option for a valid crawl job", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://www.scrapethissite.com",
          crawlerOptions: { maxDepth: 2 },
        });
      expect(crawlResponse.statusCode).toBe(200);

      let isCompleted = false;
      let completedResponse;

      while (!isCompleted) {
        const response = await request(TEST_URL)
          .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("status");

        if (response.body.status === "completed") {
          isCompleted = true;
          completedResponse = response;
        }
      }
      expect(completedResponse.statusCode).toBe(200);
      expect(completedResponse.body).toHaveProperty("status");
      expect(completedResponse.body.status).toBe("completed");
      expect(completedResponse.body).toHaveProperty("data");
      expect(completedResponse.body.data[0]).toHaveProperty("content");
      expect(completedResponse.body.data[0]).toHaveProperty("markdown");
      expect(completedResponse.body.data[0]).toHaveProperty("metadata");
      const urls = completedResponse.body.data.map(
        (item: any) => item.metadata?.sourceURL
      );
      expect(urls.length).toBeGreaterThan(1);

      // Check if all URLs have a maximum depth of 1
      urls.forEach((url) => {
        const depth = new URL(url).pathname.split("/").filter(Boolean).length;
        expect(depth).toBeLessThanOrEqual(1);
      });
    }, 120000);

    it("should return a successful response for a valid crawl job with includeHtml set to true option", async () => {
      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://firecrawl.dev",
          pageOptions: { includeHtml: true },
        });
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

      // 120 seconds
      expect(completedResponse.body.data[0]).toHaveProperty("html");
      expect(completedResponse.body.data[0]).toHaveProperty("metadata");
      expect(completedResponse.body.data[0].content).toContain("🔥 Firecrawl");
      expect(completedResponse.body.data[0].markdown).toContain("Firecrawl");
      expect(completedResponse.body.data[0].html).toContain("<h1");
    }, 60000);
  }); // 60 seconds

  it("If someone cancels a crawl job, it should turn into failed status", async () => {
    const crawlResponse = await request(TEST_URL)
      .post("/v0/crawl")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({ url: "https://jestjs.io" });
    expect(crawlResponse.statusCode).toBe(200);

    // wait for 30 seconds
    await new Promise((r) => setTimeout(r, 20000));

    const response = await request(TEST_URL)
      .delete(`/v0/crawl/cancel/${crawlResponse.body.jobId}`)
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("status");
    expect(response.body.status).toBe("cancelled");

    await new Promise((r) => setTimeout(r, 10000));

    const completedResponse = await request(TEST_URL)
      .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
    expect(completedResponse.statusCode).toBe(200);
    expect(completedResponse.body).toHaveProperty("status");
    expect(completedResponse.body.status).toBe("failed");
    expect(completedResponse.body).toHaveProperty("data");
    expect(completedResponse.body.data).toEqual(null);
    expect(completedResponse.body).toHaveProperty("partial_data");
    expect(completedResponse.body.partial_data[0]).toHaveProperty("content");
    expect(completedResponse.body.partial_data[0]).toHaveProperty("markdown");
    expect(completedResponse.body.partial_data[0]).toHaveProperty("metadata");
    
  }, 60000); // 60 seconds

  describe("POST /v0/scrape with LLM Extraction", () => {
    it("should extract data using LLM extraction mode", async () => {
      const response = await request(TEST_URL)
        .post("/v0/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://mendable.ai",
          pageOptions: {
            onlyMainContent: true,
          },
          extractorOptions: {
            mode: "llm-extraction",
            extractionPrompt:
              "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source",
            extractionSchema: {
              type: "object",
              properties: {
                company_mission: {
                  type: "string",
                },
                supports_sso: {
                  type: "boolean",
                },
                is_open_source: {
                  type: "boolean",
                },
              },
              required: ["company_mission", "supports_sso", "is_open_source"],
            },
          },
        });

      // Ensure that the job was successfully created before proceeding with LLM extraction
      expect(response.statusCode).toBe(200);

      // Assuming the LLM extraction object is available in the response body under `data.llm_extraction`
      let llmExtraction = response.body.data.llm_extraction;

      // Check if the llm_extraction object has the required properties with correct types and values
      expect(llmExtraction).toHaveProperty("company_mission");
      expect(typeof llmExtraction.company_mission).toBe("string");
      expect(llmExtraction).toHaveProperty("supports_sso");
      expect(llmExtraction.supports_sso).toBe(true);
      expect(typeof llmExtraction.supports_sso).toBe("boolean");
      expect(llmExtraction).toHaveProperty("is_open_source");
      expect(llmExtraction.is_open_source).toBe(false);
      expect(typeof llmExtraction.is_open_source).toBe("boolean");
    }, 60000); // 60 secs
  });

  // describe("POST /v0/scrape for Top 100 Companies", () => {
  //   it("should extract data for the top 100 companies", async () => {
  //     const response = await request(TEST_URL)
  //       .post("/v0/scrape")
  //       .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
  //       .set("Content-Type", "application/json")
  //       .send({
  //         url: "https://companiesmarketcap.com/",
  //         pageOptions: {
  //           onlyMainContent: true
  //         },
  //         extractorOptions: {
  //           mode: "llm-extraction",
  //           extractionPrompt: "Extract the name, market cap, price, and today's change for the top 20 companies listed on the page.",
  //           extractionSchema: {
  //             type: "object",
  //             properties: {
  //               companies: {
  //                 type: "array",
  //                 items: {
  //                   type: "object",
  //                   properties: {
  //                     rank: { type: "number" },
  //                     name: { type: "string" },
  //                     marketCap: { type: "string" },
  //                     price: { type: "string" },
  //                     todayChange: { type: "string" }
  //                   },
  //                   required: ["rank", "name", "marketCap", "price", "todayChange"]
  //                 }
  //               }
  //             },
  //             required: ["companies"]
  //           }
  //         }
  //       });

  //     // Print the response body to the console for debugging purposes
  //     console.log("Response companies:", response.body.data.llm_extraction.companies);

  //     // Check if the response has the correct structure and data types
  //     expect(response.status).toBe(200);
  //     expect(Array.isArray(response.body.data.llm_extraction.companies)).toBe(true);
  //     expect(response.body.data.llm_extraction.companies.length).toBe(40);

  //     // Sample check for the first company
  //     const firstCompany = response.body.data.llm_extraction.companies[0];
  //     expect(firstCompany).toHaveProperty("name");
  //     expect(typeof firstCompany.name).toBe("string");
  //     expect(firstCompany).toHaveProperty("marketCap");
  //     expect(typeof firstCompany.marketCap).toBe("string");
  //     expect(firstCompany).toHaveProperty("price");
  //     expect(typeof firstCompany.price).toBe("string");
  //     expect(firstCompany).toHaveProperty("todayChange");
  //     expect(typeof firstCompany.todayChange).toBe("string");
  //   }, 120000); // 120 secs
  // });

  describe("POST /v0/crawl with fast mode", () => {
    it("should complete the crawl under 20 seconds", async () => {
      const startTime = Date.now();

      const crawlResponse = await request(TEST_URL)
        .post("/v0/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://flutterbricks.com",
          crawlerOptions: {
            mode: "fast"
          }
        });

      expect(crawlResponse.statusCode).toBe(200);

      const jobId = crawlResponse.body.jobId;
      let statusResponse;
      let isFinished = false;

      while (!isFinished) {
        statusResponse = await request(TEST_URL)
          .get(`/v0/crawl/status/${jobId}`)
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);

        expect(statusResponse.statusCode).toBe(200);
        isFinished = statusResponse.body.status === "completed";

        if (!isFinished) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
        }
      }

      const endTime = Date.now();
      const timeElapsed = (endTime - startTime) / 1000; // Convert to seconds

      console.log(`Time elapsed: ${timeElapsed} seconds`);

      expect(statusResponse.body.status).toBe("completed");
      expect(statusResponse.body).toHaveProperty("data");
      expect(statusResponse.body.data[0]).toHaveProperty("content");
      expect(statusResponse.body.data[0]).toHaveProperty("markdown");
      const results = statusResponse.body.data;
      // results.forEach((result, i) => {
      //   console.log(result.metadata.sourceURL);
      // });
      expect(results.length).toBeGreaterThanOrEqual(10);
      expect(results.length).toBeLessThanOrEqual(15);
      
    }, 20000);

    // it("should complete the crawl in more than 10 seconds", async () => {
    //   const startTime = Date.now();

    //   const crawlResponse = await request(TEST_URL)
    //     .post("/v0/crawl")
    //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    //     .set("Content-Type", "application/json")
    //     .send({
    //       url: "https://flutterbricks.com",
    //     });

    //   expect(crawlResponse.statusCode).toBe(200);

    //   const jobId = crawlResponse.body.jobId;
    //   let statusResponse;
    //   let isFinished = false;

    //   while (!isFinished) {
    //     statusResponse = await request(TEST_URL)
    //       .get(`/v0/crawl/status/${jobId}`)
    //       .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);

    //     expect(statusResponse.statusCode).toBe(200);
    //     isFinished = statusResponse.body.status === "completed";

    //     if (!isFinished) {
    //       await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
    //     }
    //   }

    //   const endTime = Date.now();
    //   const timeElapsed = (endTime - startTime) / 1000; // Convert to seconds

    //   console.log(`Time elapsed: ${timeElapsed} seconds`);

    //   expect(statusResponse.body.status).toBe("completed");
    //   expect(statusResponse.body).toHaveProperty("data");
    //   expect(statusResponse.body.data[0]).toHaveProperty("content");
    //   expect(statusResponse.body.data[0]).toHaveProperty("markdown");
    //   const results = statusResponse.body.data;
    //   // results.forEach((result, i) => {
    //   //   console.log(result.metadata.sourceURL);
    //   // });
    //   expect(results.length).toBeGreaterThanOrEqual(10);
    //   expect(results.length).toBeLessThanOrEqual(15);
      
    // }, 50000);// 15 seconds timeout to account for network delays
  });

  describe("GET /is-production", () => {
    it("should return the production status", async () => {
      const response = await request(TEST_URL).get("/is-production");
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("isProduction");
    });
  });

  describe("Rate Limiter", () => {
    it("should return 429 when rate limit is exceeded for preview token", async () => {
      for (let i = 0; i < 4; i++) {
        const response = await request(TEST_URL)
          .post("/v0/scrape")
          .set("Authorization", `Bearer this_is_just_a_preview_token`)
          .set("Content-Type", "application/json")
          .send({ url: "https://www.scrapethissite.com" });

        expect(response.statusCode).toBe(200);
      }
      const response = await request(TEST_URL)
        .post("/v0/scrape")
        .set("Authorization", `Bearer this_is_just_a_preview_token`)
        .set("Content-Type", "application/json")
        .send({ url: "https://www.scrapethissite.com" });

      expect(response.statusCode).toBe(429);
    }, 60000);
  });

  // it("should return 429 when rate limit is exceeded for API key", async () => {
  //   for (let i = 0; i < parseInt(process.env.RATE_LIMIT_TEST_API_KEY_SCRAPE); i++) {
  //     const response = await request(TEST_URL)
  //       .post("/v0/scrape")
  //       .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
  //       .set("Content-Type", "application/json")
  //       .send({ url: "https://www.scrapethissite.com" });

  //     expect(response.statusCode).toBe(200);
  //   }

  //   const response = await request(TEST_URL)
  //     .post("/v0/scrape")
  //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
  //     .set("Content-Type", "application/json")
  //     .send({ url: "https://www.scrapethissite.com" });

  //   expect(response.statusCode).toBe(429);
  // }, 60000);

  // it("should return 429 when rate limit is exceeded for API key", async () => {
  //   for (let i = 0; i < parseInt(process.env.RATE_LIMIT_TEST_API_KEY_CRAWL); i++) {
  //     const response = await request(TEST_URL)
  //       .post("/v0/crawl")
  //       .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
  //       .set("Content-Type", "application/json")
  //       .send({ url: "https://www.scrapethissite.com" });

  //     expect(response.statusCode).toBe(200);
  //   }

  //   const response = await request(TEST_URL)
  //     .post("/v0/crawl")
  //     .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
  //     .set("Content-Type", "application/json")
  //     .send({ url: "https://www.scrapethissite.com" });

  //   expect(response.statusCode).toBe(429);
  // }, 60000);
});
