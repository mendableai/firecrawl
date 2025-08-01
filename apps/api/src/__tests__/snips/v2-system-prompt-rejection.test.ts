import request from "supertest";
import { Identity, idmux } from "./lib";
import { ScrapeRequestInput } from "../../controllers/v2/types";

const TEST_URL = "http://127.0.0.1:3002";

async function scrapeV2Raw(body: ScrapeRequestInput, identity: Identity) {
  return await request(TEST_URL)
    .post("/v2/scrape")
    .set("Authorization", `Bearer ${identity.apiKey}`)
    .set("Content-Type", "application/json")
    .send(body);
}

describe("V2 System Prompt Rejection", () => {
  let identity: Identity;

  beforeAll(async () => {
    identity = await idmux({
      name: "v2-system-prompt-rejection",
      concurrency: 100,
      credits: 1000000,
    });
  });

  it("should reject systemPrompt in json format options for v2 scrape", async () => {
    const response = await scrapeV2Raw(
      {
        url: "https://example.com",
        formats: [
          {
            type: "json",
            schema: {
              type: "object",
              properties: { title: { type: "string" } },
            },
            systemPrompt: "Custom system prompt that should be rejected",
          },
        ],
      } as any,
      identity,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Bad Request");
  });

  it("should accept valid json format options without systemPrompt", async () => {
    const response = await scrapeV2Raw(
      {
        url: "https://example.com",
        formats: [
          {
            type: "json",
            schema: {
              type: "object",
              properties: { title: { type: "string" } },
            },
            prompt: "Extract the title",
          },
        ],
      } as any,
      identity,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
