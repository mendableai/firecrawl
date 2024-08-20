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

    it.concurrent("should throw error for blocklisted URL", async () => {
      const scrapeRequest: ScrapeRequest = {
        url: "https://facebook.com/fake-test",
      };

      const response = await request(TEST_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);

      expect(response.statusCode).toBe(403);
      expect(response.body.error).toBe("URL is blocked. Firecrawl currently does not support social media scraping due to policy restrictions.");
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
    it.concurrent('should return a successful response for a valid scrape with PDF file', async () => {
        const scrapeRequest: ScrapeRequest = {
          url: "https://arxiv.org/pdf/astro-ph/9301001.pdf"
        //   formats: ["markdown", "html"],
        };
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send(scrapeRequest);
        await new Promise((r) => setTimeout(r, 6000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.markdown).toContain('Broad Line Radio Galaxy');
        expect(response.body.data.metadata.statusCode).toBe(200);
        expect(response.body.data.metadata.error).toBeUndefined();
      }, 60000);

      it.concurrent('should return a successful response for a valid scrape with PDF file without explicit .pdf extension', async () => {
        const scrapeRequest: ScrapeRequest = {
          url: "https://arxiv.org/pdf/astro-ph/9301001"
        };
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send(scrapeRequest);
        await new Promise((r) => setTimeout(r, 6000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.markdown).toContain('Broad Line Radio Galaxy');
        expect(response.body.data.metadata.statusCode).toBe(200);
        expect(response.body.data.metadata.error).toBeUndefined();
      }, 60000);

      it.concurrent("should return a successful response with a valid API key with removeTags option", async () => {
        const scrapeRequest: ScrapeRequest = {
          url: "https://www.scrapethissite.com/",
          onlyMainContent: false // default is true
        };
        const responseWithoutRemoveTags: ScrapeResponseRequestTest = await request(TEST_URL)
          .post("/v1/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send(scrapeRequest);
        expect(responseWithoutRemoveTags.statusCode).toBe(200);
        expect(responseWithoutRemoveTags.body).toHaveProperty("data");

        if (!("data" in responseWithoutRemoveTags.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(responseWithoutRemoveTags.body.data).toHaveProperty("markdown");
        expect(responseWithoutRemoveTags.body.data).toHaveProperty("metadata");
        expect(responseWithoutRemoveTags.body.data).not.toHaveProperty("html");
        expect(responseWithoutRemoveTags.body.data.markdown).toContain("[FAQ](/faq/)"); // .nav
        expect(responseWithoutRemoveTags.body.data.markdown).toContain("Hartley Brody 2023"); // #footer
  
        const scrapeRequestWithRemoveTags: ScrapeRequest = {
            url: "https://www.scrapethissite.com/",
            excludeTags: ['.nav', '#footer', 'strong'],
            onlyMainContent: false // default is true
        };
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post("/v1/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send(scrapeRequestWithRemoveTags);

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty("data");
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty("markdown");
        expect(response.body.data).toHaveProperty("metadata");
        expect(response.body.data).not.toHaveProperty("html");
        expect(response.body.data.markdown).not.toContain("Hartley Brody 2023");
        expect(response.body.data.markdown).not.toContain("[FAQ](/faq/)"); // 
      }, 30000);

      it.concurrent('should return a successful response for a scrape with 400 page', async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send({ url: 'https://httpstat.us/400' });
        await new Promise((r) => setTimeout(r, 5000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.metadata.statusCode).toBe(400);
      }, 60000);


      it.concurrent('should return a successful response for a scrape with 401 page', async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send({ url: 'https://httpstat.us/401' });
        await new Promise((r) => setTimeout(r, 5000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.metadata.statusCode).toBe(401);
      }, 60000);

      it.concurrent('should return a successful response for a scrape with 403 page', async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send({ url: 'https://httpstat.us/403' });
        await new Promise((r) => setTimeout(r, 5000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.metadata.statusCode).toBe(403);
      }, 60000);

      it.concurrent('should return a successful response for a scrape with 404 page', async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send({ url: 'https://httpstat.us/404' });
        await new Promise((r) => setTimeout(r, 5000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.metadata.statusCode).toBe(404);
      }, 60000);

      it.concurrent('should return a successful response for a scrape with 405 page', async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send({ url: 'https://httpstat.us/405' });
        await new Promise((r) => setTimeout(r, 5000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.metadata.statusCode).toBe(405);
      }, 60000);

      it.concurrent('should return a successful response for a scrape with 500 page', async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post('/v1/scrape')
          .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
          .set('Content-Type', 'application/json')
          .send({ url: 'https://httpstat.us/500' });
        await new Promise((r) => setTimeout(r, 5000));
  
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('data');
        if (!("data" in response.body)) {
          throw new Error("Expected response body to have 'data' property");
        }
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.metadata.statusCode).toBe(500);
      }, 60000);

      it.concurrent("should return a timeout error when scraping takes longer than the specified timeout", async () => {
        const response: ScrapeResponseRequestTest = await request(TEST_URL)
          .post("/v1/scrape")
          .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
          .set("Content-Type", "application/json")
          .send({ url: "https://firecrawl.dev", timeout: 1000 });
  
        expect(response.statusCode).toBe(408);
      }, 3000);

      it.concurrent(
        "should return a successful response with a valid API key and includeHtml set to true",
        async () => {
          const scrapeRequest: ScrapeRequest = {
            url: "https://roastmywebsite.ai",
            formats: ["html","rawHtml"],
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
          expect(response.body.data).not.toHaveProperty("markdown");
          expect(response.body.data).toHaveProperty("html");
          expect(response.body.data).toHaveProperty("rawHtml");
          expect(response.body.data).toHaveProperty("metadata");
          expect(response.body.data.html).toContain("<h1");
          expect(response.body.data.rawHtml).toContain("<html");
          expect(response.body.data.metadata.statusCode).toBe(200);
          expect(response.body.data.metadata.error).toBeUndefined();
        },
        30000
      );

      it.concurrent(
        "should return a successful response with waitFor",
        async () => {
          const scrapeRequest: ScrapeRequest = {
            url: "https://ycombinator.com/companies",
            formats: ["markdown"],
            waitFor: 5000
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
          expect(response.body.data).not.toHaveProperty("html");
          expect(response.body.data).not.toHaveProperty("links");
          expect(response.body.data).not.toHaveProperty("rawHtml");
          expect(response.body.data).toHaveProperty("metadata");
          expect(response.body.data.markdown).toContain("PagerDuty");
          expect(response.body.data.metadata.statusCode).toBe(200);
          expect(response.body.data.metadata.error).toBeUndefined();

        },
        30000
      );

      it.concurrent(
        "should return a successful response with a valid links on page",
        async () => {
          const scrapeRequest: ScrapeRequest = {
            url: "https://roastmywebsite.ai",
            formats: ["links"],
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
          expect(response.body.data).not.toHaveProperty("html");
          expect(response.body.data).not.toHaveProperty("rawHtml");
          expect(response.body.data).toHaveProperty("links");
          expect(response.body.data).toHaveProperty("metadata");
          expect(response.body.data.links).toContain("https://firecrawl.dev");
          expect(response.body.data.metadata.statusCode).toBe(200);
          expect(response.body.data.metadata.error).toBeUndefined();
        },
        30000
      );
      

  });

describe("POST /v1/map", () => {
  it.concurrent("should require authorization", async () => {
    const response: ScrapeResponseRequestTest = await request(TEST_URL).post(
      "/v1/map"
    );
    expect(response.statusCode).toBe(401);
  });

  it.concurrent("should return an error response with an invalid API key", async () => {
    const response: ScrapeResponseRequestTest = await request(TEST_URL)
      .post("/v1/map")
      .set("Authorization", `Bearer invalid-api-key`)
      .set("Content-Type", "application/json")
      .send({ url: "https://firecrawl.dev" });
    expect(response.statusCode).toBe(401);
  });

  it.concurrent("should return a successful response with a valid API key", async () => {
    const mapRequest = {
      url: "https://roastmywebsite.ai"
    };

    const response: ScrapeResponseRequestTest = await request(TEST_URL)
      .post("/v1/map")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send(mapRequest);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("links");
    if (!("links" in response.body)) {
      throw new Error("Expected response body to have 'links' property");
    }
    const links = response.body.links as unknown[];
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
  });

  it.concurrent("should return a successful response with a valid API key and search", async () => {
    const mapRequest = {
      url: "https://usemotion.com",
      search: "pricing"
    };

    const response: ScrapeResponseRequestTest = await request(TEST_URL)
      .post("/v1/map")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send(mapRequest);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("links");
    if (!("links" in response.body)) {
      throw new Error("Expected response body to have 'links' property");
    }
    const links = response.body.links as unknown[];
    expect(Array.isArray(links)).toBe(true);
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toContain("usemotion.com/pricing");
  });

  it.concurrent("should return an error for invalid URL", async () => {
    const mapRequest = {
      url: "invalid-url",
      includeSubdomains: true,
      search: "test",
    };

    const response: ScrapeResponseRequestTest = await request(TEST_URL)
      .post("/v1/map")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send(mapRequest);

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body).toHaveProperty("error");
  });
});
});
