import { batchScrape, crawl, creditUsage, extract, map, scrape, search, tokenUsage } from "./lib";

const sleep = (ms: number) => new Promise(x => setTimeout(() => x(true), ms));
const sleepForBatchBilling = () => sleep(20000);

beforeAll(async () => {
    // Wait for previous test runs to stop billing processing
    await sleep(40000);
}, 50000);

describe("Billing tests", () => {
    if (process.env.TEST_SUITE_SELF_HOSTED) {
        it("dummy", () => {
            expect(true).toBe(true);
        });
    } else {
        it("bills scrape correctly", async () => {
            const rc1 = (await creditUsage()).remaining_credits;
            
            // Run all scrape operations in parallel with Promise.all
            await Promise.all([
                // scrape 1: regular fc.dev scrape (1 credit)
                scrape({
                    url: "https://firecrawl.dev"
                }),
                
                // scrape 1.1: regular fc.dev scrape (1 credit)
                scrape({
                    url: "https://firecrawl.dev"
                }),
                
                // scrape 2: fc.dev with json (5 credits)
                scrape({
                    url: "https://firecrawl.dev",
                    formats: ["json"],
                    jsonOptions: {
                        schema: {
                            type: "object",
                            properties: {
                                is_open_source: { type: "boolean" },
                            },
                            required: ["is_open_source"],
                        },
                    },
                })
            ]);
            
            // sum: 7 credits

            await sleepForBatchBilling();

            const rc2 = (await creditUsage()).remaining_credits;

            expect(rc1 - rc2).toBe(7);
        }, 120000);

        it("bills batch scrape correctly", async () => {
            const rc1 = (await creditUsage()).remaining_credits;
            
            // Run both scrape operations in parallel with Promise.all
            const [scrape1, scrape2] = await Promise.all([
                // scrape 1: regular batch scrape with failing domain (2 credits)
                batchScrape({
                    urls: [
                        "https://firecrawl.dev",
                        "https://mendable.ai",
                        "https://thisdomaindoesnotexistandwillfail.fcr",
                    ],
                }),
                
                // scrape 2: batch scrape with json (10 credits)
                batchScrape({
                    urls: [
                        "https://firecrawl.dev",
                        "https://mendable.ai",
                        "https://thisdomaindoesnotexistandwillfail.fcr",
                    ],
                    formats: ["json"],
                    jsonOptions: {
                        schema: {
                            type: "object",
                            properties: {
                                four_word_summary: { type: "string" },
                            },
                            required: ["four_word_summary"],
                        },
                    },
                })
            ]);
            
            // sum: 12 credits

            await sleepForBatchBilling();

            const rc2 = (await creditUsage()).remaining_credits;

            expect(rc1 - rc2).toBe(12);
        }, 300000);

        it("bills crawl correctly", async () => {
            const rc1 = (await creditUsage()).remaining_credits;
            
            // Run both crawl operations in parallel with Promise.all
            const [crawl1, crawl2] = await Promise.all([
                // crawl 1: regular fc.dev crawl (x credits)
                crawl({
                    url: "https://firecrawl.dev",
                }),
                
                // crawl 2: fc.dev crawl with json (5y credits)
                crawl({
                    url: "https://firecrawl.dev",
                    scrapeOptions: {
                        formats: ["json"],
                        jsonOptions: {
                            schema: {
                                type: "object",
                                properties: {
                                    four_word_summary: { type: "string" },
                                },
                                required: ["four_word_summary"],
                            },
                        },
                    }
                })
            ]);
            
            // sum: x+5y credits

            await sleepForBatchBilling();

            const rc2 = (await creditUsage()).remaining_credits;

            expect(rc1 - rc2).toBe(crawl1.body.completed + crawl2.body.completed * 5);
        }, 300000);

        it("bills map correctly", async () => {
            const rc1 = (await creditUsage()).remaining_credits;
            await map({ url: "https://firecrawl.dev" });
            await sleepForBatchBilling();
            const rc2 = (await creditUsage()).remaining_credits;
            expect(rc1 - rc2).toBe(1);
        }, 60000);

        it("bills search correctly", async () => {
            const rc1 = (await creditUsage()).remaining_credits;

            const results = await search({
                query: "firecrawl"
            });

            await sleepForBatchBilling();

            const rc2 = (await creditUsage()).remaining_credits;

            expect(rc1 - rc2).toBe(results.length);
        }, 60000);

        it("bills extract correctly", async () => {
            const rc1 = (await tokenUsage()).remaining_tokens;
            
            await extract({
                urls: ["https://firecrawl.dev"],
                schema: {
                    "type": "object",
                    "properties": {
                        "is_open_source": {
                            "type": "boolean"
                        }
                    },
                    "required": [
                        "is_open_source"
                    ]
                },
                origin: "api-sdk",
            });

            await sleepForBatchBilling();
            
            const rc2 = (await tokenUsage()).remaining_tokens;

            expect(rc1 - rc2).toBe(305);
        }, 300000);
    }
});