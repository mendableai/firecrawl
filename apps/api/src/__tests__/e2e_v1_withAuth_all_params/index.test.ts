import request from "supertest";
import { configDotenv } from "dotenv";
import {
  ScrapeRequest,
  ScrapeResponseRequestTest,
} from "../../controllers/v1/types";

configDotenv();
const FIRECRAWL_API_URL = "http://127.0.0.1:3002";
const E2E_TEST_SERVER_URL = "http://firecrawl-e2e-test.vercel.app"; // @rafaelsideguide/firecrawl-e2e-test

describe("E2E Tests for v1 API Routes", () => {

  it.concurrent("should handle 'formats:markdown (default)' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL
      } as ScrapeRequest;

      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
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
      
      expect(response.body.data.markdown).toContain("This page is used for end-to-end (e2e) testing with Firecrawl.");
      expect(response.body.data.markdown).toContain("Content with id #content-1");
      expect(response.body.data.markdown).toContain("Loading...");
      expect(response.body.data.markdown).toContain("Click me!");
      expect(response.body.data.markdown).toContain("This content loads only when you see it. Don't blink! 👼"); // the browser always scroll to the bottom
      expect(response.body.data.markdown).not.toContain("Header"); // Only main content is returned by default
      expect(response.body.data.markdown).not.toContain("footer"); // Only main content is returned by default
      expect(response.body.data.markdown).not.toContain("This content is only visible on mobile");
    },
  30000);

  it.concurrent("should handle 'formats:html' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        formats: ["html"]
      } as ScrapeRequest;

      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
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

      expect(response.body.data.html).not.toContain("<header class=\"row-start-1\">Header</header>");
      expect(response.body.data.html).toContain("<p>This page is used for end-to-end (e2e) testing with Firecrawl.</p>");
    },
  30000);

  it.concurrent("should handle 'rawHtml' in 'formats' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        formats: ["rawHtml"]
      } as ScrapeRequest;

      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
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
      expect(response.body.data).toHaveProperty("rawHtml");

      expect(response.body.data.rawHtml).toContain("<p>This page is used for end-to-end (e2e) testing with Firecrawl.</p>");
      expect(response.body.data.rawHtml).toContain("<header class=\"row-start-1\">Header</header>");
    },
  30000);
  
  // - TODO: tests for links
  // - TODO: tests for screenshot
  // - TODO: tests for screenshot@fullPage

  it.concurrent("should handle 'headers' parameter correctly", async () => {
    const scrapeRequest = {
      url: E2E_TEST_SERVER_URL,
      headers: { "e2e-header-test": "firecrawl" }
    } as ScrapeRequest;

    const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
      .post("/v1/scrape")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send(scrapeRequest);

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("data");
    if (!("data" in response.body)) {
      throw new Error("Expected response body to have 'data' property");
    }

    expect(response.body.data.markdown).toContain("e2e-header-test: firecrawl");
  }, 30000);
  
  it.concurrent("should handle 'includeTags' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        includeTags: ['#content-1']
      } as ScrapeRequest;

      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("data");
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }

      expect(response.body.data.markdown).not.toContain("<p>This page is used for end-to-end (e2e) testing with Firecrawl.</p>");
      expect(response.body.data.markdown).toContain("Content with id #content-1");
    },
  30000);
  
  it.concurrent("should handle 'excludeTags' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        excludeTags: ['#content-1']
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("data");
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }

      expect(response.body.data.markdown).toContain("This page is used for end-to-end (e2e) testing with Firecrawl.");
      expect(response.body.data.markdown).not.toContain("Content with id #content-1");
    },
  30000);
  
  it.concurrent("should handle 'onlyMainContent' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        onlyMainContent: false
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty("data");
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      
      expect(response.body.data.markdown).toContain("This page is used for end-to-end (e2e) testing with Firecrawl.");
    },
  30000);
  
  it.concurrent("should handle 'timeout' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        timeout: 500
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(408);

      if (!("error" in response.body)) {
        throw new Error("Expected response body to have 'error' property");
      }
      expect(response.body.error).toBe("Request timed out");
      expect(response.body.success).toBe(false);
    }, 30000);

  
  it.concurrent("should handle 'mobile' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        mobile: true
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);

      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      expect(response.body.data.markdown).toContain("This content is only visible on mobile");
    },
  30000);
  
  it.concurrent("should handle 'parsePDF' parameter correctly",
    async () => {  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({ url: 'https://arxiv.org/pdf/astro-ph/9301001.pdf'});
      await new Promise((r) => setTimeout(r, 6000));

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('data');
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }

      expect(response.body.data.markdown).toContain('arXiv:astro-ph/9301001v1 7 Jan 1993');
      expect(response.body.data.markdown).not.toContain('h7uKu14adDL6yGfnGf2qycY5uq8kC3OKCWkPxm');

      const responseNoParsePDF: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send({ url: 'https://arxiv.org/pdf/astro-ph/9301001.pdf', parsePDF: false });
      await new Promise((r) => setTimeout(r, 6000));

      expect(responseNoParsePDF.statusCode).toBe(200);
      expect(responseNoParsePDF.body).toHaveProperty('data');
      if (!("data" in responseNoParsePDF.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      expect(responseNoParsePDF.body.data.markdown).toContain('h7uKu14adDL6yGfnGf2qycY5uq8kC3OKCWkPxm');
    },
  30000);
  
  // it.concurrent("should handle 'location' parameter correctly",
  //   async () => {
  //     const scrapeRequest: ScrapeRequest = {
  //       url: "https://roastmywebsite.ai",
  //       location: {
  //         country: "US",
  //         languages: ["en"]
  //       }
  //     };
  
  //     const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
  //       .post("/v1/scrape")
  //       .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
  //       .set("Content-Type", "application/json")
  //       .send(scrapeRequest);
  
  //     expect(response.statusCode).toBe(200);
  //     // Add assertions to verify location is handled correctly
  //   },
  // 30000);
  
  it.concurrent("should handle 'skipTlsVerification' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: "https://expired.badssl.com/",
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      const metadata = response.body.data.metadata as { error: string; statusCode: number };
      expect(metadata.error).toContain("certificate has expired")
      expect(metadata.statusCode).toBe(500)
      
      const scrapeRequestWithSkipTlsVerification = {
        url: "https://expired.badssl.com/",
        skipTlsVerification: true
      } as ScrapeRequest;
  
      const responseWithSkipTlsVerification: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequestWithSkipTlsVerification);
  
      expect(responseWithSkipTlsVerification.statusCode).toBe(200);
      if (!("data" in responseWithSkipTlsVerification.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      console.log(responseWithSkipTlsVerification.body.data)
      expect(responseWithSkipTlsVerification.body.data.markdown).toContain("badssl.com");
    },
  60000);
  
  // it.concurrent("should handle 'removeBase64Images' parameter correctly",
  //   async () => {
  //     const scrapeRequest: ScrapeRequest = {
  //       url: "",
  //       removeBase64Images: false
  //     };
  
  //     const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
  //       .post("/v1/scrape")
  //       .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
  //       .set("Content-Type", "application/json")
  //       .send(scrapeRequest);
  
  //     expect(response.statusCode).toBe(200);
  //     // Add assertions to verify removeBase64Images is handled correctly
  //   },
  // 30000);

  // actions:
  // -[x] Wait
  // -[ ] Screenshot
  // -[x] Click
  // -[ ] Write text
  // -[ ] Press a key
  // -[ ] Scroll
  // -[ ] Scrape
  it.concurrent("should handle 'action wait' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        actions: [{
          type: "wait",
          milliseconds: 10000
        }]
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      expect(response.body.data.markdown).not.toContain("Loading...");
      expect(response.body.data.markdown).toContain("Content loaded after 5 seconds!");
    },
  30000);

  // screenshot
  it.concurrent("should handle 'action screenshot' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        actions: [{
          type: "wait",
          milliseconds: 10000
        }]
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      // expect(response.body.data.markdown).not.toContain("Click me!");
      // expect(response.body.data.markdown).toContain("Text changed after click!");
    },
  30000);

  it.concurrent("should handle 'action click' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        actions: [{
          type: "click",
          selector: "#click-me"
        }]
      } as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      expect(response.body.data.markdown).not.toContain("Click me!");
      expect(response.body.data.markdown).toContain("Text changed after click!");
    },
  30000);

  // -[ ] Write text
  it.concurrent("should handle 'action write' parameter correctly",
    async () => {
      const scrapeRequest = {
        url: E2E_TEST_SERVER_URL,
        formats: ["markdown", "html"],
        actions: [{
          type: "write",
          text: "Hello, world!",
          selector: "#input-1"
        },
        {
          type: "screenshot"
        }  
      ]} as ScrapeRequest;
  
      const response: ScrapeResponseRequestTest = await request(FIRECRAWL_API_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(scrapeRequest);
  
      expect(response.statusCode).toBe(200);
      if (!("data" in response.body)) {
        throw new Error("Expected response body to have 'data' property");
      }
      console.log(response.body.data)
      // expect(response.body.data.markdown).not.toContain("Click me!");
      // expect(response.body.data.markdown).toContain("Text changed after click!");
    },
  30000);
});