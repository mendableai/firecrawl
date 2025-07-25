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
    it.concurrent("generates basic summary", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary"],
        extract: {
          mode: "llm",
          prompt: "Summarize what this company does and their main product.",
        },
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
      expect(result.summary!.length).toBeGreaterThan(10);
    }, 90000);

    it.concurrent("works with custom prompt", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary"],
        extract: {
          mode: "llm",
          prompt: "Create a brief summary focusing on the technical aspects.",
        },
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
    }, 90000);

    it.concurrent("works with jsonOptions", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary"],
        jsonOptions: {
          mode: "llm",
          prompt: "Provide a concise summary of the main features and benefits.",
        },
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
    }, 90000);

    it.concurrent("works with default prompt", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary"],
        extract: {
          mode: "llm",
        },
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
    }, 90000);

    it.concurrent("works with custom system prompt", async () => {
      const result = await scrape({
        url: "https://firecrawl.dev",
        formats: ["summary"],
        extract: {
          mode: "llm",
          systemPrompt: "You are a technical writer. Focus on the technical implementation details.",
          prompt: "Summarize the technical aspects of this product.",
        },
      }, identity);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe("string");
    }, 90000);
  } else {
    it.concurrent("dummy test", () => {
      expect(true).toBe(true);
    });
  }
});
