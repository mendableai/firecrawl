import { generateURLPermutations } from "./crawl-redis";

describe("generateURLPermutations", () => {
  it("generates permutations correctly", () => {
    const bareHttps = generateURLPermutations("https://firecrawl.dev").map(
      (x) => x.href,
    );
    expect(bareHttps.length).toBe(4);
    expect(bareHttps.includes("https://firecrawl.dev/")).toBe(true);
    expect(bareHttps.includes("https://www.firecrawl.dev/")).toBe(true);
    expect(bareHttps.includes("http://firecrawl.dev/")).toBe(true);
    expect(bareHttps.includes("http://www.firecrawl.dev/")).toBe(true);

    const bareHttp = generateURLPermutations("http://firecrawl.dev").map(
      (x) => x.href,
    );
    expect(bareHttp.length).toBe(4);
    expect(bareHttp.includes("https://firecrawl.dev/")).toBe(true);
    expect(bareHttp.includes("https://www.firecrawl.dev/")).toBe(true);
    expect(bareHttp.includes("http://firecrawl.dev/")).toBe(true);
    expect(bareHttp.includes("http://www.firecrawl.dev/")).toBe(true);

    const wwwHttps = generateURLPermutations("https://www.firecrawl.dev").map(
      (x) => x.href,
    );
    expect(wwwHttps.length).toBe(4);
    expect(wwwHttps.includes("https://firecrawl.dev/")).toBe(true);
    expect(wwwHttps.includes("https://www.firecrawl.dev/")).toBe(true);
    expect(wwwHttps.includes("http://firecrawl.dev/")).toBe(true);
    expect(wwwHttps.includes("http://www.firecrawl.dev/")).toBe(true);

    const wwwHttp = generateURLPermutations("http://www.firecrawl.dev").map(
      (x) => x.href,
    );
    expect(wwwHttp.length).toBe(4);
    expect(wwwHttp.includes("https://firecrawl.dev/")).toBe(true);
    expect(wwwHttp.includes("https://www.firecrawl.dev/")).toBe(true);
    expect(wwwHttp.includes("http://firecrawl.dev/")).toBe(true);
    expect(wwwHttp.includes("http://www.firecrawl.dev/")).toBe(true);
  });
});
