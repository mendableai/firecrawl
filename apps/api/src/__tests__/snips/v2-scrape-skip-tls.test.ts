import request from "supertest";
import { Identity, idmux } from "./lib";

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
        timeout: 30000,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.markdown).toContain("badssl.com");
  }, 60000);

  test("should allow explicit skipTlsVerification: false override", async () => {
    const response = await request(TEST_URL)
      .post("/v2/scrape")
      .set("Authorization", `Bearer ${identity.apiKey}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://expired.badssl.com/",
        skipTlsVerification: false,
        timeout: 30000,
      });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  }, 60000);

  test("should work with valid HTTPS sites regardless of skipTlsVerification setting", async () => {
    const response = await request(TEST_URL)
      .post("/v2/scrape")
      .set("Authorization", `Bearer ${identity.apiKey}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://example.com",
        timeout: 30000,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.markdown).toContain("Example Domain");
  }, 60000);

  describe("V2 Format Structure Tests", () => {
    test("string formats still work", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", "screenshot"],
          timeout: 30000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
    }, 60000);

    test("object json format works", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", { 
            type: "json", 
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" }
              }
            },
            prompt: "Extract the page title and description"
          }],
          timeout: 60000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
      expect(response.body.data.json).toBeDefined();
      expect(typeof response.body.data.json).toBe("object");
    }, 90000);

    test("object changeTracking format works", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", { 
            type: "changeTracking",
            modes: ["json"],
            tag: "test-tag"
          }],
          timeout: 60000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
    }, 90000);

    test("mixed string and object formats work", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", { 
            type: "json", 
            schema: {
              type: "object",
              properties: {
                title: { type: "string" }
              }
            }
          }, "screenshot"],
          timeout: 60000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
      expect(response.body.data.json).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
    }, 90000);

    test("backwards compatibility with v1 jsonOptions", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", "json"],
          jsonOptions: {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" }
              }
            },
            prompt: "Extract the page title"
          },
          timeout: 60000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
      expect(response.body.data.json).toBeDefined();
    }, 90000);

    test("backwards compatibility with v1 changeTrackingOptions", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", "changeTracking"],
          changeTrackingOptions: {
            modes: ["json"],
            tag: "v1-test"
          },
          timeout: 60000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
    }, 90000);

    test("object format with temperature parameter", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", { 
            type: "json", 
            schema: {
              type: "object",
              properties: {
                title: { type: "string" }
              }
            },
            temperature: 0.1
          }],
          timeout: 60000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
      expect(response.body.data.json).toBeDefined();
    }, 90000);

    test("changeTracking with git-diff mode", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["markdown", { 
            type: "changeTracking",
            modes: ["git-diff"],
            tag: "git-diff-test"
          }],
          timeout: 60000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.markdown).toBeDefined();
    }, 90000);
  });
});
