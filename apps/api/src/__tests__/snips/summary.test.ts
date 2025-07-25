import { scrape, idmux, Identity } from "./lib";

let identity: Identity;

beforeAll(async () => {
  identity = await idmux({
    name: "summary",
    concurrency: 100,
    tokens: 1000000,
  });
}, 10000);

describe("Summary format tests", () => {
  if (!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL) {
    it.concurrent("generates basic summary with no options required", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary"],
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
      expect(result.summary!.length).toBeGreaterThan(10);
    }, 90000);

    it.concurrent("works with markdown format", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["markdown", "summary"],
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
      expect(result.markdown).toBeDefined();
    }, 90000);

    it.concurrent("works alongside extract format", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary", "extract"],
        extract: {
          mode: "llm",
          prompt: "Extract the company name",
          schema: {
            type: "object",
            properties: {
              company_name: { type: "string" }
            }
          }
        },
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
      expect(result.extract).toBeDefined();
    }, 90000);

    it.concurrent("works alongside json format", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary", "json"],
        jsonOptions: {
          mode: "llm",
          prompt: "Extract company info as JSON",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" }
            }
          }
        },
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
      expect(result.json).toBeDefined();
    }, 90000);

    it.concurrent("works with multiple formats", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["markdown", "html", "summary"],
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
      expect(result.markdown).toBeDefined();
      expect(result.html).toBeDefined();
    }, 90000);
  } else {
    it.concurrent("dummy test", () => {
      expect(true).toBe(true);
    });
  }
});
