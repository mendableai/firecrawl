import request from "supertest";
import { Identity, idmux } from "./lib";

const TEST_URL = process.env.TEST_URL || "http://127.0.0.1:3002";

describe("V2 Scrape Screenshot Viewport", () => {
  if (!process.env.TEST_SUITE_SELF_HOSTED) {
    let identity: Identity;

    beforeAll(async () => {
      identity = await idmux({
        name: "v2-scrape-viewport",
        concurrency: 100,
        credits: 1000000,
      });
    }, 10000);

    test("should take screenshot with custom viewport dimensions", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [
            "markdown",
            {
              type: "screenshot",
              viewport: {
                width: 1920,
                height: 1080
              }
            }
          ],
          timeout: 30000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
      expect(response.body.data.markdown).toBeDefined();
    }, 60000);

    test("should take full page screenshot with custom viewport width", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [
            {
              type: "screenshot",
              fullPage: true,
              viewport: {
                width: 1440,
                height: 900
              }
            }
          ],
          timeout: 30000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
    }, 60000);

    test("should work with screenshot format without viewport (backwards compatibility)", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: ["screenshot"],
          timeout: 30000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
    }, 60000);

    test("should work with object screenshot format without viewport", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [
            {
              type: "screenshot",
              fullPage: false
            }
          ],
          timeout: 30000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.screenshot).toBeDefined();
    }, 60000);

    test("should reject invalid viewport dimensions", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [
            {
              type: "screenshot",
              viewport: {
                width: -100,
                height: 0
              }
            }
          ],
          timeout: 30000,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }, 60000);

    test("should reject non-integer viewport dimensions", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [
            {
              type: "screenshot",
              viewport: {
                width: "1920",
                height: 1080.5
              }
            }
          ],
          timeout: 30000,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }, 60000);

    test("should reject viewport dimensions exceeding maximum limits", async () => {
      const response = await request(TEST_URL)
        .post("/v2/scrape")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          url: "https://example.com",
          formats: [
            {
              type: "screenshot",
              viewport: {
                width: 8000, // exceeds max of 7680
                height: 5000 // exceeds max of 4320
              }
            }
          ],
          timeout: 30000,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }, 60000);
  } else {
    it("mocked", () => {
      expect(true).toBe(true);
    });
  }
});