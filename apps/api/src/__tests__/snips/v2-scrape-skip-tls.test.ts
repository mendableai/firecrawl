import request from "supertest";
import { Identity, idmux, scrapeTimeout } from "./lib";

const TEST_URL = process.env.TEST_URL || "http://127.0.0.1:3002";

describe("V2 Scrape skipTlsVerification Default", () => {
  let identity: Identity;

  beforeAll(async () => {
    identity = await idmux({
      name: "v2-scrape-skip-tls",
      concurrency: 100,
      credits: 1000000,
    });
  }, 10000);

  test("should default skipTlsVerification to true in v2 API", async () => {
    const response = await request(TEST_URL)
      .post("/v2/scrape")
      .set("Authorization", `Bearer ${identity.apiKey}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://expired.badssl.com/",
        timeout: scrapeTimeout,
      });
    
    if (response.status !== 200) {
      console.warn('Non-200 response:', JSON.stringify(response.body));
    }

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.markdown).toContain("badssl.com");
  }, scrapeTimeout);

  test("should allow explicit skipTlsVerification: false override", async () => {
    const response = await request(TEST_URL)
      .post("/v2/scrape")
      .set("Authorization", `Bearer ${identity.apiKey}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://expired.badssl.com/",
        skipTlsVerification: false,
        timeout: scrapeTimeout,
      });

    if (response.status !== 500) {
      console.warn('Non-500 response:', JSON.stringify(response.body));
    }

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  }, scrapeTimeout);

  test("should work with valid HTTPS sites regardless of skipTlsVerification setting", async () => {
    const response = await request(TEST_URL)
      .post("/v2/scrape")
      .set("Authorization", `Bearer ${identity.apiKey}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://example.com",
        timeout: scrapeTimeout,
      });

    if (response.status !== 200) {
      console.warn('Non-200 response:', JSON.stringify(response.body));
    }

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.markdown).toContain("Example Domain");
  }, scrapeTimeout);

  if (!process.env.TEST_SUITE_SELF_HOSTED) {
    test("should support object screenshot format", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [{ type: "screenshot", fullPage: false }],
          timeout: scrapeTimeout,
        });

      if (response.status !== 200) {
        console.warn('Non-200 response:', JSON.stringify(response.body));
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
      expect(typeof response.body.data.screenshot).toBe("string");
    }, scrapeTimeout);

    test("should support object screenshot format with fullPage", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [{ type: "screenshot", fullPage: true }],
          timeout: scrapeTimeout,
        });

      if (response.status !== 200) {
        console.warn('Non-200 response:', JSON.stringify(response.body));
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
      expect(typeof response.body.data.screenshot).toBe("string");
    }, scrapeTimeout);
  }
});
