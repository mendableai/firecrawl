import { extract } from "./lib";

describe("Extract tests", () => {
    if (!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL) {
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
    } else {
        it.concurrent("dummy test", () => {
            expect(true).toBe(true);
        });
    }
});
