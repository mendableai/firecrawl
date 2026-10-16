import {
  scrape,
  scrapeWithFailure,
  scrapeTimeout,
  idmux,
  Identity,
} from "./lib";

// Runs only where an extraction provider is configured for the API under test
// (EXTRACTION_PROVIDER_BASE_URL with a 100% rollout or the test team allowlisted).
const configured = !!process.env.EXTRACTION_PROVIDER_BASE_URL;

let identity: Identity;

beforeAll(async () => {
  identity = await idmux({
    name: "extraction-provider",
    concurrency: 10,
    credits: 1_000_000,
  });
}, 10000);

(configured ? describe : describe.skip)(
  "JSON extraction via the extraction provider",
  () => {
    it.concurrent(
      "returns a schema-conforming object",
      async () => {
        const response = await scrape(
          {
            url: "https://firecrawl.dev",
            formats: [
              {
                type: "json",
                schema: {
                  type: "object",
                  properties: {
                    company_name: { type: "string" },
                    tagline: { type: "string" },
                  },
                  required: ["company_name", "tagline"],
                },
              },
            ],
          },
          identity,
        );
        expect(response.json).toBeDefined();
        expect(typeof response.json.company_name).toBe("string");
        expect(response.json.company_name.toLowerCase()).toContain("firecrawl");
      },
      scrapeTimeout,
    );
  },
);

describe("JSON format model option", () => {
  it.concurrent(
    "rejects a model that is not available",
    async () => {
      const response = await scrapeWithFailure(
        {
          url: "https://firecrawl.dev",
          formats: [
            {
              type: "json",
              model: "not-a-configured-extraction-model",
              schema: { type: "object", properties: { x: { type: "string" } } },
            },
          ],
        },
        identity,
      );
      expect(response.error).toContain("Unsupported extraction model");
    },
    scrapeTimeout,
  );
});
