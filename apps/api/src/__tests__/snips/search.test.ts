import { search } from "./lib";

describe("Search tests", () => {
  it.concurrent("works", async () => {
    await search({
      query: "firecrawl"
    });
  }, 60000);
});
