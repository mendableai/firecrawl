import { supabase_service } from "../../services/supabase";
import { SUBSCRIPTION_STATUSES, createSubscription, handlePaymentMethodUpdate } from "../../services/billing/stripe";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

import { batchScrape, crawl, creditUsage, extract, map, scrape, search, tokenUsage } from "./lib";

const sleep = (ms: number) => new Promise(x => setTimeout(() => x(true), ms));
const sleepForBatchBilling = () => sleep(40000);

beforeAll(async () => {
    // Wait for previous test runs to stop billing processing
    if (!process.env.TEST_SUITE_SELF_HOSTED) {
        await sleep(40000);
    }
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
        }, 600000);

        it("bills crawl correctly", async () => {
            const rc1 = (await creditUsage()).remaining_credits;
            
            // Run both crawl operations in parallel with Promise.all
            const [crawl1, crawl2] = await Promise.all([
                // crawl 1: regular fc.dev crawl (x credits)
                crawl({
                    url: "https://firecrawl.dev",
                    limit: 10,
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
                    },
                    limit: 10,
                })
            ]);
            
            expect(crawl1.success).toBe(true);
            expect(crawl2.success).toBe(true);
            
            // sum: x+5y credits

            await sleepForBatchBilling();

            const rc2 = (await creditUsage()).remaining_credits;

            if (crawl1.success && crawl2.success) {
                expect(rc1 - rc2).toBe(crawl1.completed + crawl2.completed * 5);
            }
        }, 600000);

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

        it("bills search with scrape correctly", async () => {
            const rc1 = (await creditUsage()).remaining_credits;

            const results = await search({
                query: "firecrawl",
                scrapeOptions: {
                    formats: ["markdown"],
                },
            });

            await sleepForBatchBilling();

            const rc2 = (await creditUsage()).remaining_credits;

            expect(rc1 - rc2).toBe(results.length);
        }, 600000);

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
it("prevents duplicate subscriptions for the same plan", async () => {
    const team_id = "test_team";
    const customer_id = "test_customer";
    const price_id = "test_price";

    await supabase_service.from("subscriptions").insert({
        team_id,
        price_id,
        status: SUBSCRIPTION_STATUSES.ACTIVE,
    });

    const result = await createSubscription(team_id, customer_id, price_id);
    expect(result.success).toBe(false);
    expect(result.message).toContain("You already have an active/paused/past due subscription for this plan.");
});

it("allows multiple CREDIT pack purchases", async () => {
    const team_id = "test_team";
    const customer_id = "test_customer";
    const price_id = process.env.STRIPE_CREDIT_PACK_PRICE_ID || "default_credit_pack_price_id";

    const result = await createSubscription(team_id, customer_id, price_id);
    expect(result.success).toBe(true);
    expect(result.message).toContain("Credit pack purchase allowed");
});

it("handles payment method updates", async () => {
    const customer_id = "test_customer";

    jest.spyOn(stripe.customers, 'listPaymentMethods').mockResolvedValueOnce({ data: [], has_more: false, object: "list", url: "" } as any);

    const result = await handlePaymentMethodUpdate(customer_id);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Please contact help@firecrawl.com if you continue to experience issues");
});

});
