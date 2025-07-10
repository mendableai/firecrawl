import { asyncCrawl, asyncCrawlWaitForFinish, crawl, crawlOngoing, crawlStart, Identity, idmux, scrapeTimeout } from "./lib";
import { describe, it, expect } from "@jest/globals";
import request from "supertest";

const TEST_URL = "http://127.0.0.1:3002";

let identity: Identity;

beforeAll(async () => {
  identity = await idmux({
    name: "crawl",
    concurrency: 100,
    credits: 1000000,
  });
}, 10000);

describe("Crawl tests", () => {
    it.concurrent("works", async () => {
        await crawl({
            url: "https://firecrawl.dev",
            limit: 10,
        }, identity);
    }, 10 * scrapeTimeout);

    it.concurrent("filters URLs properly", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev/pricing",
            includePaths: ["^/pricing$"],
            limit: 10,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBeGreaterThan(0);
            for (const page of res.data) {
                const url = new URL(page.metadata.url ?? page.metadata.sourceURL!);
                expect(url.pathname).toMatch(/^\/pricing$/);
            }
        }
    }, 10 * scrapeTimeout);

    it.concurrent("filters URLs properly when using regexOnFullURL", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev/pricing",
            includePaths: ["^https://(www\\.)?firecrawl\\.dev/pricing$"],
            regexOnFullURL: true,
            limit: 10,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBe(1);
            expect(res.data[0].metadata.sourceURL).toBe("https://firecrawl.dev/pricing");
        }
    }, 10 * scrapeTimeout);

    it.concurrent("delay parameter works", async () => {
        await crawl({
            url: "https://firecrawl.dev",
            limit: 3,
            delay: 5,
        }, identity);
    }, 3 * scrapeTimeout + 3 * 5000);

    it.concurrent("ongoing crawls endpoint works", async () => {
        const beforeCrawl = new Date();
        
        const res = await asyncCrawl({
            url: "https://firecrawl.dev",
            limit: 3,
        }, identity);

        const ongoing = await crawlOngoing(identity);
        const afterCrawl = new Date();
        
        const crawlItem = ongoing.crawls.find(x => x.id === res.id);
        expect(crawlItem).toBeDefined();
        
        if (crawlItem) {
            expect(crawlItem.created_at).toBeDefined();
            expect(typeof crawlItem.created_at).toBe("string");
            
            const createdAtDate = new Date(crawlItem.created_at);
            expect(createdAtDate).toBeInstanceOf(Date);
            expect(createdAtDate.getTime()).not.toBeNaN();
            
            expect(crawlItem.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            
            expect(createdAtDate.getTime()).toBeGreaterThanOrEqual(beforeCrawl.getTime() - 1000);
            expect(createdAtDate.getTime()).toBeLessThanOrEqual(afterCrawl.getTime() + 1000);
        }

        await asyncCrawlWaitForFinish(res.id, identity);

        const ongoing2 = await crawlOngoing(identity);

        expect(ongoing2.crawls.find(x => x.id === res.id)).toBeUndefined();
    }, 3 * scrapeTimeout);
    
    // TEMP: Flaky
    // it.concurrent("discovers URLs properly when origin is not included", async () => {
    //     const res = await crawl({
    //         url: "https://firecrawl.dev",
    //         includePaths: ["^/blog"],
    //         ignoreSitemap: true,
    //         limit: 10,
    //     });

    //     expect(res.success).toBe(true);
    //     if (res.success) {
    //         expect(res.data.length).toBeGreaterThan(1);
    //         for (const page of res.data) {
    //             expect(page.metadata.url ?? page.metadata.sourceURL).toMatch(/^https:\/\/(www\.)?firecrawl\.dev\/blog/);
    //         }
    //     }
    // }, 300000);
    
    // TEMP: Flaky
    // it.concurrent("discovers URLs properly when maxDiscoveryDepth is provided", async () => {
    //     const res = await crawl({
    //         url: "https://firecrawl.dev",
    //         ignoreSitemap: true,
    //         maxDiscoveryDepth: 1,
    //         limit: 10,
    //     });
    //     expect(res.success).toBe(true);
    //     if (res.success) {
    //         expect(res.data.length).toBeGreaterThan(1);
    //         for (const page of res.data) {
    //             expect(page.metadata.url ?? page.metadata.sourceURL).not.toMatch(/^https:\/\/(www\.)?firecrawl\.dev\/blog\/.+$/);
    //         }
    //     }
    // }, 300000);

    it.concurrent("crawlEntireDomain parameter works", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            crawlEntireDomain: true,
            limit: 5,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBeGreaterThan(0);
        }
    }, 5 * scrapeTimeout);

    it.concurrent("crawlEntireDomain takes precedence over allowBackwardLinks", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            allowBackwardLinks: false,
            crawlEntireDomain: true,
            limit: 5,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBeGreaterThan(0);
        }
    }, 5 * scrapeTimeout);

    it.concurrent("backward compatibility - allowBackwardLinks still works", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            allowBackwardLinks: true,
            limit: 5,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBeGreaterThan(0);
        }
    }, 5 * scrapeTimeout);

    it.concurrent("allowSubdomains parameter works", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            allowSubdomains: true,
            limit: 5,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBeGreaterThan(0);
        }
    }, 5 * scrapeTimeout);

    it.concurrent("allowSubdomains blocks subdomains when false", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev", 
            allowSubdomains: false,
            limit: 5,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            for (const page of res.data) {
                const url = new URL(page.metadata.url ?? page.metadata.sourceURL!);
                expect(url.hostname.endsWith("firecrawl.dev")).toBe(true);
            }
        }
    }, 5 * scrapeTimeout);

    it.concurrent("rejects crawl when URL depth exceeds maxDepth", async () => {
        const response = await crawlStart({
            url: "https://firecrawl.dev/blog/category/deep/nested/path",
            maxDepth: 2,
            limit: 5,
        }, identity);

        expect(response.statusCode).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe("Bad Request");
        expect(response.body.details).toBeDefined();
        expect(response.body.details[0].message).toBe("URL depth exceeds the specified maxDepth");
        expect(response.body.details[0].path).toEqual(["url"]);
    });

    it.concurrent("accepts crawl when URL depth equals maxDepth", async () => {
        const response = await crawlStart({
            url: "https://firecrawl.dev/blog/category",
            maxDepth: 2,
            limit: 5,
        }, identity);

        expect(response.statusCode).toBe(200);
        expect(response.body.success).toBe(true);
        expect(typeof response.body.id).toBe("string");
    });

    it.concurrent("accepts crawl when URL depth is less than maxDepth", async () => {
        const response = await crawlStart({
            url: "https://firecrawl.dev/blog",
            maxDepth: 5,
            limit: 5,
        }, identity);

        expect(response.statusCode).toBe(200);
        expect(response.body.success).toBe(true);
        expect(typeof response.body.id).toBe("string");
    });

    describe("Credit validation error messages", () => {
        if (process.env.TEST_SUITE_SELF_HOSTED) {
            it("dummy", () => {
                expect(true).toBe(true);
            });
        } else {
            it.concurrent("V0 crawl shows clear error when limit exceeds remaining credits", async () => {
                const identity = await idmux({
                    name: "crawl/v0-limit-exceeds-credits",
                    credits: 5,
                });

                const response = await request(TEST_URL)
                    .post("/v0/crawl")
                    .set("Authorization", `Bearer ${identity.apiKey}`)
                    .set("Content-Type", "application/json")
                    .send({
                        url: "https://firecrawl.dev",
                        crawlerOptions: { limit: 10 }
                    });

                expect(response.statusCode).toBe(402);
                expect(response.body.error).toContain("Insufficient credits for the requested limit of 10");
                expect(response.body.error).toContain("You have 5 credits remaining");
                expect(response.body.error).toContain("reduce your limit to 5 or fewer");
            });

            it.concurrent("V0 crawl shows clear error when no credits remaining", async () => {
                const identity = await idmux({
                    name: "crawl/v0-no-credits",
                    credits: 0,
                });

                const response = await request(TEST_URL)
                    .post("/v0/crawl")
                    .set("Authorization", `Bearer ${identity.apiKey}`)
                    .set("Content-Type", "application/json")
                    .send({
                        url: "https://firecrawl.dev",
                        crawlerOptions: { limit: 5 }
                    });

                expect(response.statusCode).toBe(402);
                expect(response.body.error).toContain("Insufficient credits to perform this request");
                expect(response.body.error).not.toContain("reduce your limit");
            });

            it.concurrent("V1 crawl auto-adjusts limit when possible", async () => {
                const identity = await idmux({
                    name: "crawl/v1-auto-adjust",
                    credits: 5,
                });

                const response = await crawlStart({
                    url: "https://firecrawl.dev",
                    limit: 10
                }, identity);

                expect(response.statusCode).toBe(200);
                expect(response.body.success).toBe(true);
            });

            it.concurrent("V1 crawl shows clear error when no credits remaining", async () => {
                const identity = await idmux({
                    name: "crawl/v1-no-credits",
                    credits: 0,
                });

                const response = await crawlStart({
                    url: "https://firecrawl.dev",
                    limit: 5
                }, identity);

                expect(response.statusCode).toBe(402);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toContain("Insufficient credits to perform this request");
            });
        }
    });
});
