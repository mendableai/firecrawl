import { asyncCrawl, asyncCrawlWaitForFinish, crawl, crawlErrors, crawlOngoing, crawlStart, Identity, idmux, scrapeTimeout } from "./lib";
import { describe, it, expect } from "@jest/globals";
import request from "supertest";

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
        const results = await crawl({
            url: "https://firecrawl.dev",
            limit: 10,
        }, identity);

        expect(results.completed).toBe(10);
    }, 10 * scrapeTimeout);

    it.concurrent("works with ignoreSitemap: true", async () => {
        const results = await crawl({
            url: "https://firecrawl.dev",
            limit: 10,
            ignoreSitemap: true,
        }, identity);

        expect(results.completed).toBe(10);
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

    it.concurrent("allowSubdomains correctly allows same registrable domain using PSL", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            allowSubdomains: true,
            allowExternalLinks: false,
            limit: 3,
        }, identity);

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.length).toBeGreaterThan(0);
            for (const page of res.data) {
                const url = new URL(page.metadata.url ?? page.metadata.sourceURL!);
                const hostname = url.hostname;
                
                expect(
                    hostname === "firecrawl.dev" || 
                    hostname.endsWith(".firecrawl.dev")
                ).toBe(true);
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

    it.concurrent("crawl errors endpoint works with Redis cache", async () => {
        const crawlResult = await asyncCrawl({
            url: "https://firecrawl.dev",
            limit: 3,
        }, identity);

        await asyncCrawlWaitForFinish(crawlResult.id, identity);

        const errors = await crawlErrors(crawlResult.id, identity);
        
        expect(errors.errors).toBeDefined();
        expect(Array.isArray(errors.errors)).toBe(true);
        expect(errors.robotsBlocked).toBeDefined();
        expect(Array.isArray(errors.robotsBlocked)).toBe(true);
    }, 3 * scrapeTimeout);

    it.concurrent("crawl errors endpoint returns 404 for nonexistent crawl", async () => {
        const nonexistentId = "nonexistent-crawl-id-12345";
        
        const response = await request("http://127.0.0.1:3002")
            .get(`/v1/crawl/${nonexistentId}/errors`)
            .set("Authorization", `Bearer ${identity.apiKey}`)
            .send();

        expect(response.statusCode).toBe(404);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe("Job not found");
    });

    it.concurrent("crawl errors endpoint returns 403 for wrong team", async () => {
        const crawlResult = await asyncCrawl({
            url: "https://firecrawl.dev",
            limit: 2,
        }, identity);

        await asyncCrawlWaitForFinish(crawlResult.id, identity);

        const wrongIdentity = await idmux({
            name: "crawl-errors-wrong-team",
            concurrency: 100,
            credits: 1000000,
        });

        const response = await request("http://127.0.0.1:3002")
            .get(`/v1/crawl/${crawlResult.id}/errors`)
            .set("Authorization", `Bearer ${wrongIdentity.apiKey}`)
            .send();

        expect(response.statusCode).toBe(403);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe("Forbidden");
    }, 3 * scrapeTimeout);
});
