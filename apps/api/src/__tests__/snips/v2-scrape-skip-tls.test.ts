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
});
