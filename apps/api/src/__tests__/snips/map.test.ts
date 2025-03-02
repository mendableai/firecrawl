import { expectMapToSucceed, map } from "./lib";

describe("Map tests", () => {
  it.concurrent("basic map succeeds", async () => {
    const response = await map({
      url: "http://firecrawl.dev",
    });

    expectMapToSucceed(response);
  }, 10000);

  it.concurrent("times out properly", async () => {
    const response = await map({
      url: "http://firecrawl.dev",
      timeout: 1
    });

    expect(response.statusCode).toBe(408);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Request timed out");
  }, 10000);

  it.concurrent("handles query parameters correctly", async () => {
    let response = await map({
      url: "https://www.hfea.gov.uk",
      sitemapOnly: true,
      useMock: "map-query-params",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.links.some(x => x.match(/^https:\/\/www\.hfea\.gov\.uk\/choose-a-clinic\/clinic-search\/results\/?\?options=\d+$/))).toBe(true);
  }, 60000);
});
