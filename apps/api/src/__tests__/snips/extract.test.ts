import request from "supertest";
import { configDotenv } from "dotenv";
import { ExtractRequestInput, ExtractResponse } from "../../controllers/v1/types";

configDotenv();
const TEST_URL = "http://127.0.0.1:3002";

async function extractStart(body: ExtractRequestInput) {
  return await request(TEST_URL)
    .post("/v1/extract")
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    .set("Content-Type", "application/json")
    .send(body);
}

async function extractStatus(id: string) {
    return await request(TEST_URL)
      .get("/v1/extract/" + encodeURIComponent(id))
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .send();
}

async function extract(body: ExtractRequestInput): Promise<ExtractResponse> {
    const es = await extractStart(body);
    expectExtractStartToSucceed(es);
    
    let x;

    do {
        x = await extractStatus(es.body.id);
        expect(x.statusCode).toBe(200);
        expect(typeof x.body.status).toBe("string");
    } while (x.body.status !== "completed");

    expectExtractToSucceed(x);
    return x.body;
}

function expectExtractStartToSucceed(response: Awaited<ReturnType<typeof extractStart>>) {
  expect(response.statusCode).toBe(200);
  expect(response.body.success).toBe(true);
  expect(typeof response.body.id).toBe("string");
}

function expectExtractToSucceed(response: Awaited<ReturnType<typeof extractStatus>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.status).toBe("string");
    expect(response.body.status).toBe("completed");
    expect(response.body).toHaveProperty("data");
}

describe("Extract tests", () => {
    it.concurrent("works", async () => {
        const res = await extract({
            urls: ["https://firecrawl.dev"],
            schema: {
                "type": "object",
                "properties": {
                    "company_mission": {
                        "type": "string"
                    },
                    "is_open_source": {
                        "type": "boolean"
                    }
                },
                "required": [
                    "company_mission",
                    "is_open_source"
                ]
            },
            origin: "api-sdk",
        });

        expect(res.data).toHaveProperty("company_mission");
        expect(typeof res.data.company_mission).toBe("string")
        expect(res.data).toHaveProperty("is_open_source");
        expect(typeof res.data.is_open_source).toBe("boolean");
        expect(res.data.is_open_source).toBe(true);
    }, 60000);
});
