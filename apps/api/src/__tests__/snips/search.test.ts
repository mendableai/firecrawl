import { search } from "./lib";

describe("Search tests", () => {
  it.concurrent("works", async () => {
    await search({
      query: "firecrawl"
    });
  }, 60000);

  it.concurrent("works with scrape", async () => {
    const res = await search({
      query: "firecrawl",
      limit: 5,
      scrapeOptions: {
        formats: ["markdown"],
      },
    });

    for (const doc of res) {
      expect(doc.markdown).toBeDefined();
    }
  }, 60000);
});
