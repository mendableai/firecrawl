import { scrapeRaw, crawl, idmux, Identity, scrapeTimeout, indexCooldown } from "./lib";
import * as crypto from "crypto";

let identity: Identity;

beforeAll(async () => {
  identity = await idmux({
    name: "error-codes",
    concurrency: 10,
    credits: 100000,
  });
}, 10000 + scrapeTimeout);

describe("Error Code Tests", () => {
  describe("Scrape Error Codes", () => {
    it("should return SSL_ERROR code for SSL certificate errors", async () => {
      const raw = await scrapeRaw({
        url: "https://expired.badssl.com/",
        timeout: scrapeTimeout,
      }, identity);

      expect(raw.statusCode).toBe(500);
      expect(raw.body.success).toBe(false);
      expect(raw.body.error).toBeDefined();
      expect(raw.body.code).toBe("SSL_ERROR");
    }, scrapeTimeout);

    it("should return DNS_RESOLUTION_ERROR code for DNS failures", async () => {
      const raw = await scrapeRaw({
        url: "https://this-domain-definitely-does-not-exist-" + crypto.randomUUID() + ".com",
        timeout: scrapeTimeout,
      }, identity);

      expect(raw.statusCode).toBe(500);
      expect(raw.body.success).toBe(false);
      expect(raw.body.error).toBeDefined();
      expect(raw.body.code).toBe("DNS_RESOLUTION_ERROR");
    }, scrapeTimeout);

    it("should return TIMEOUT_ERROR code for timeout failures", async () => {
      const raw = await scrapeRaw({
        url: "https://firecrawl.dev",
        timeout: 1,
      }, identity);

      expect(raw.statusCode).toBe(408);
      expect(raw.body.success).toBe(false);
      expect(raw.body.error).toBeDefined();
      expect(raw.body.code).toBe("TIMEOUT_ERROR");
    }, 10000);

    it("should return UNSUPPORTED_FILE_ERROR code for unsupported file types", async () => {
      const raw = await scrapeRaw({
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        formats: ["markdown"],
        timeout: scrapeTimeout,
      }, identity);

      expect(raw.statusCode).toBe(500);
      expect(raw.body.success).toBe(false);
      expect(raw.body.error).toBeDefined();
      expect(raw.body.code).toBe("UNSUPPORTED_FILE_ERROR");
    }, scrapeTimeout);

    it("should return ZDR_VIOLATION_ERROR code for ZDR violations", async () => {
      // This assumes ZDR is enabled and blocks certain patterns
      const raw = await scrapeRaw({
        url: "https://example.com/test?email=test@example.com&ssn=123-45-6789",
        timeout: scrapeTimeout,
        formats: ["html"],
      }, identity);

      // ZDR violations might return 400 instead of 500
      expect([400, 500]).toContain(raw.statusCode);
      expect(raw.body.success).toBe(false);
      expect(raw.body.error).toBeDefined();
      expect(raw.body.code).toBe("ZDR_VIOLATION_ERROR");
    }, scrapeTimeout);
  });

  describe("Crawl Error Codes", () => {
    it("should return error codes for failed crawl jobs", async () => {
      const crawlResponse = await crawl({
        url: "https://expired.badssl.com/",
        limit: 1,
      }, identity);

      expect(crawlResponse.id).toBeDefined();
      
      // Wait for crawl to complete
      let status = crawlResponse.status;
      while (status === "scraping") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusResponse = await fetch(`http://127.0.0.1:3002/v1/crawl/${crawlResponse.id}`, {
          headers: {
            Authorization: `Bearer ${identity.apiKey}`,
          },
        });
        const statusData = await statusResponse.json();
        status = statusData.status;
      }

      // Check crawl errors endpoint
      const errorsResponse = await fetch(`http://127.0.0.1:3002/v1/crawl/${crawlResponse.id}/errors`, {
        headers: {
          Authorization: `Bearer ${identity.apiKey}`,
        },
      });
      
      const errorsData = await errorsResponse.json();
      expect(errorsData.errors).toBeDefined();
      expect(errorsData.errors.length).toBeGreaterThan(0);
      
      // Each error should have a code
      for (const error of errorsData.errors) {
        expect(error.error).toBeDefined();
        expect(error.code).toBeDefined();
        expect(error.code).toBe("SSL_ERROR");
      }
    }, scrapeTimeout + indexCooldown);
  });

  describe("Extract Error Codes", () => {
    it("should return error codes for extract failures", async () => {
      const response = await fetch(`http://127.0.0.1:3002/v1/extract`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${identity.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://this-domain-definitely-does-not-exist-" + crypto.randomUUID() + ".com",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
            },
          },
          timeout: scrapeTimeout,
        }),
      });

      const data = await response.json();
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("DNS_RESOLUTION_ERROR");
    }, scrapeTimeout);
  });

  describe("Validation Error Codes", () => {
    it("should return INVALID_URL_ERROR code for invalid URLs", async () => {
      const raw = await scrapeRaw({
        url: "not-a-valid-url",
        timeout: scrapeTimeout,
      }, identity);

      expect(raw.statusCode).toBe(400);
      expect(raw.body.success).toBe(false);
      expect(raw.body.error).toBeDefined();
      expect(raw.body.code).toBe("INVALID_URL_ERROR");
    }, scrapeTimeout);

    it("should return INSUFFICIENT_CREDITS_ERROR code for insufficient credits", async () => {
      const poorIdentity = await idmux({
        name: "error-codes-poor",
        concurrency: 1,
        credits: 0,
      });

      const raw = await scrapeRaw({
        url: "https://example.com",
        timeout: scrapeTimeout,
      }, poorIdentity);

      expect(raw.statusCode).toBe(402);
      expect(raw.body.success).toBe(false);
      expect(raw.body.error).toBeDefined();
      expect(raw.body.code).toBe("INSUFFICIENT_CREDITS_ERROR");
    }, scrapeTimeout);
  });
});