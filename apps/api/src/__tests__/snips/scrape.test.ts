import request from "supertest";
import { configDotenv } from "dotenv";
import { ScrapeRequestInput } from "../../controllers/v1/types";

configDotenv();
const TEST_URL = "http://127.0.0.1:3002";

async function scrape(body: ScrapeRequestInput) {
  return await request(TEST_URL)
    .post("/v1/scrape")
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    .set("Content-Type", "application/json")
    .send(body);
}

function expectScrapeToSucceed(response: Awaited<ReturnType<typeof scrape>>) {
  expect(response.statusCode).toBe(200);
  expect(response.body.success).toBe(true);
  expect(typeof response.body.data).toBe("object");
}

describe("Scrape tests", () => {
  it("mocking works properly", async () => {
    // depends on falsified mock mocking-works-properly
    // this test will fail if mock is bypassed with real data -- firecrawl.dev will never have
    // that as its actual markdown output

    const response = await scrape({
      url: "http://firecrawl.dev",
      useMock: "mocking-works-properly",
    });

    expectScrapeToSucceed(response);
    expect(response.body.data.markdown).toBe(
      "this is fake data coming from the mocking system!",
    );
  });

  describe("Ad blocking (f-e dependant)", () => {
    it.concurrent("blocks ads by default", async () => {
      const response = await scrape({
        url: "https://canyoublockit.com/testing/",
      });

      expectScrapeToSucceed(response);
      expect(response.body.data.markdown).not.toContain(".g.doubleclick.net/");
    }, 10000);

    it.concurrent("doesn't block ads if explicitly disabled", async () => {
      const response = await scrape({
        url: "https://canyoublockit.com/testing/",
        blockAds: false,
      });

      expectScrapeToSucceed(response);
      expect(response.body.data.markdown).toContain(".g.doubleclick.net/");
    }, 10000);
  });
  
  describe("Location API (f-e dependant)", () => {
    it.concurrent("works without specifying an explicit location", async () => {
      const response = await scrape({
        url: "https://iplocation.com",
      });
  
      expectScrapeToSucceed(response);
    }, 10000);

    it.concurrent("works with country US", async () => {
      const response = await scrape({
        url: "https://iplocation.com",
        location: { country: "US" },
      });
  
      expectScrapeToSucceed(response);
      expect(response.body.data.markdown).toContain("| Country | United States |");
    }, 10000);
  });

  describe("JSON scrape support", () => {
    it.concurrent("returns parseable JSON", async () => {
      const response = await scrape({
        url: "https://jsonplaceholder.typicode.com/todos/1",
        formats: ["rawHtml"],
      });

      expectScrapeToSucceed(response);
      const obj = JSON.parse(response.body.data.rawHtml);
      expect(obj.id).toBe(1);
    }, 25000); // TODO: mock and shorten
  })
});
