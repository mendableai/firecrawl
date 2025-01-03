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
        expect(response.body.data.markdown).toBe("this is fake data coming from the mocking system!");
    });
});