import { asyncCrawl, asyncCrawlWaitForFinish, crawl, crawlOngoing, Identity, idmux, scrapeTimeout } from "./lib";
import { describe, it, expect } from "@jest/globals";

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
        const res = await asyncCrawl({
            url: "https://firecrawl.dev",
            limit: 3,
        }, identity);

        const ongoing = await crawlOngoing(identity);

        expect(ongoing.crawls.find(x => x.id === res.id)).toBeDefined();

        await asyncCrawlWaitForFinish(res.id, identity);

        const ongoing2 = await crawlOngoing(identity);

        expect(ongoing2.crawls.find(x => x.id === res.id)).toBeUndefined();
    }, 3 * scrapeTimeout);

    it.concurrent("ongoing crawls endpoint includes created_at field", async () => {
        const res = await asyncCrawl({
            url: "https://firecrawl.dev",
            limit: 3,
        }, identity);

        const ongoing = await crawlOngoing(identity);
        const crawlItem = ongoing.crawls.find(x => x.id === res.id);

        expect(crawlItem).toBeDefined();
        if (crawlItem) {
            expect(crawlItem.created_at).toBeDefined();
            expect(typeof crawlItem.created_at).toBe("string");
            
            const createdAtDate = new Date(crawlItem.created_at);
            expect(createdAtDate).toBeInstanceOf(Date);
            expect(createdAtDate.getTime()).not.toBeNaN();
            
            expect(crawlItem.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        }

        await asyncCrawlWaitForFinish(res.id, identity);
    }, 3 * scrapeTimeout);

    it.concurrent("created_at timestamp is recent for new crawls", async () => {
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
            const createdAt = new Date(crawlItem.created_at);
            
            expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCrawl.getTime() - 1000);
            expect(createdAt.getTime()).toBeLessThanOrEqual(afterCrawl.getTime() + 1000);
        }

        await asyncCrawlWaitForFinish(res.id, identity);
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
});
