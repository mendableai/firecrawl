import request from "supertest";
import { configDotenv } from "dotenv";
import { BatchScrapeRequestInput } from "../../controllers/v1/types";

configDotenv();
const TEST_URL = "http://127.0.0.1:3002";

async function batchScrapeStart(body: BatchScrapeRequestInput) {
  return await request(TEST_URL)
    .post("/v1/batch/scrape")
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    .set("Content-Type", "application/json")
    .send(body);
}

async function batchScrapeStatus(id: string) {
    return await request(TEST_URL)
      .get("/v1/batch/scrape/" + encodeURIComponent(id))
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .send();
}

async function batchScrape(body: BatchScrapeRequestInput): ReturnType<typeof batchScrapeStatus> {
    const bss = await batchScrapeStart(body);
    expectBatchScrapeStartToSucceed(bss);
    
    let x;

    do {
        x = await batchScrapeStatus(bss.body.id);
        expect(x.statusCode).toBe(200);
        expect(typeof x.body.status).toBe("string");
    } while (x.body.status !== "completed")

    expectBatchScrapeToSucceed(x);
    return x;
}

function expectBatchScrapeStartToSucceed(response: Awaited<ReturnType<typeof batchScrape>>) {
  expect(response.statusCode).toBe(200);
  expect(response.body.success).toBe(true);
  expect(typeof response.body.id).toBe("string");
}

function expectBatchScrapeToSucceed(response: Awaited<ReturnType<typeof batchScrapeStatus>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.status).toBe("string");
    expect(response.body.status).toBe("completed");
    expect(response.body).toHaveProperty("data");
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
}

describe("Batch scrape tests", () => {
  describe("JSON format", () => {
    it.concurrent("works", async () => {
        const response = await batchScrape({
            urls: ["http://firecrawl.dev"],
            formats: ["json"],
            jsonOptions: {
                prompt: "Based on the information on the page, find what the company's mission is and whether it supports SSO, and whether it is open source.",
                schema: {
                    type: "object",
                    properties: {
                        company_mission: {
                            type: "string",
                        },
                        supports_sso: {
                            type: "boolean",
                        },
                        is_open_source: {
                            type: "boolean",
                        },
                    },
                    required: ["company_mission", "supports_sso", "is_open_source"],
                },
            },
        });
      
        expect(response.body.data[0]).toHaveProperty("json");
        expect(response.body.data[0].json).toHaveProperty("company_mission");
        expect(typeof response.body.data[0].json.company_mission).toBe("string");
        expect(response.body.data[0].json).toHaveProperty("supports_sso");
        expect(response.body.data[0].json.supports_sso).toBe(false);
        expect(typeof response.body.data[0].json.supports_sso).toBe("boolean");
        expect(response.body.data[0].json).toHaveProperty("is_open_source");
        expect(response.body.data[0].json.is_open_source).toBe(true);
        expect(typeof response.body.data[0].json.is_open_source).toBe("boolean");
    }, 30000);
  });
});
