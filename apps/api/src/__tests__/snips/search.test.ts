import request from "supertest";
import { configDotenv } from "dotenv";
import { Document, SearchRequestInput } from "../../controllers/v1/types";

configDotenv();
const TEST_URL = "http://127.0.0.1:3002";

async function searchRaw(body: SearchRequestInput) {
  return await request(TEST_URL)
    .post("/v1/search")
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    .set("Content-Type", "application/json")
    .send(body);
}

function expectScrapeToSucceed(response: Awaited<ReturnType<typeof searchRaw>>) {
  expect(response.statusCode).toBe(200);
  expect(response.body.success).toBe(true);
  expect(typeof response.body.data).toBe("object");
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.data.length).toBeGreaterThan(0);
}

async function search(body: SearchRequestInput): Promise<Document> {
  const raw = await searchRaw(body);
  expectScrapeToSucceed(raw);
  return raw.body.data;
}

describe("Scrape tests", () => {
  it("works", async () => {
    await search({
      query: "firecrawl"
    });
  }, 15000);
});
