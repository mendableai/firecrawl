import request from "supertest";
import { configDotenv } from "dotenv";
import { CrawlRequestInput } from "../../controllers/v1/types";

configDotenv();
const TEST_URL = "http://127.0.0.1:3002";

async function crawlStart(body: CrawlRequestInput) {
  return await request(TEST_URL)
    .post("/v1/crawl")
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    .set("Content-Type", "application/json")
    .send(body);
}

async function crawlStatus(id: string) {
    return await request(TEST_URL)
      .get("/v1/crawl/" + encodeURIComponent(id))
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .send();
}

async function crawl(body: CrawlRequestInput): ReturnType<typeof crawlStatus> {
    const cs = await crawlStart(body);
    expectCrawlStartToSucceed(cs);
    
    let x;

    do {
        x = await crawlStatus(cs.body.id);
        expect(x.statusCode).toBe(200);
        expect(typeof x.body.status).toBe("string");
    } while (x.body.status !== "completed")

    expectCrawlToSucceed(x);
    return x;
}

function expectCrawlStartToSucceed(response: Awaited<ReturnType<typeof crawlStart>>) {
  expect(response.statusCode).toBe(200);
  expect(response.body.success).toBe(true);
  expect(typeof response.body.id).toBe("string");
}

function expectCrawlToSucceed(response: Awaited<ReturnType<typeof crawlStatus>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.status).toBe("string");
    expect(response.body.status).toBe("completed");
    expect(response.body).toHaveProperty("data");
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
}

describe("Crawl tests", () => {
    it.concurrent("works", async () => {
        await crawl({
            url: "https://firecrawl.dev",
            limit: 10,
        });
    }, 120000);
});
