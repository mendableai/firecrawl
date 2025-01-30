import request from "supertest";
import { configDotenv } from "dotenv";
import { MapRequestInput } from "../../controllers/v1/types";

configDotenv();
const TEST_URL = "http://127.0.0.1:3002";

async function map(body: MapRequestInput) {
  return await request(TEST_URL)
    .post("/v1/map")
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    .set("Content-Type", "application/json")
    .send(body);
}

function expectMapToSucceed(response: Awaited<ReturnType<typeof map>>) {
  expect(response.statusCode).toBe(200);
  expect(response.body.success).toBe(true);
  expect(Array.isArray(response.body.links)).toBe(true);
  expect(response.body.links.length).toBeGreaterThan(0);
}

describe("Map tests", () => {
  it("basic map succeeds", async () => {
    const response = await map({
      url: "http://firecrawl.dev",
    });

    expectMapToSucceed(response);
  }, 10000);

  it("times out properly", async () => {
    const response = await map({
      url: "http://firecrawl.dev",
      timeout: 1
    });

    expect(response.statusCode).toBe(408);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe("Request timed out");
  }, 10000);
});
