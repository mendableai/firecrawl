import { scrapeRaw, Identity, idmux } from "./lib";

describe("V2 System Prompt Rejection", () => {
  let identity: Identity;

  beforeAll(async () => {
    identity = await idmux({
      name: "v2-system-prompt-rejection",
      concurrency: 100,
      credits: 1000000,
    });
  });

  it("should reject systemPrompt in jsonOptions for v2 scrape", async () => {
    const response = await scrapeRaw({
      url: "https://example.com",
      formats: ["json"],
      jsonOptions: {
        schema: { title: { type: "string" } },
        systemPrompt: "Custom system prompt that should be rejected"
      }
    }, identity);

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("Unrecognized key");
  });

  it("should reject systemPrompt in extract options for v2 scrape", async () => {
    const response = await scrapeRaw({
      url: "https://example.com",
      formats: ["extract"],
      extract: {
        schema: { title: { type: "string" } },
        systemPrompt: "Custom system prompt that should be rejected"
      }
    }, identity);

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("Unrecognized key");
  });

  it("should accept valid jsonOptions without systemPrompt", async () => {
    const response = await scrapeRaw({
      url: "https://example.com",
      formats: ["json"],
      jsonOptions: {
        schema: { title: { type: "string" } },
        prompt: "Extract the title"
      }
    }, identity);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
