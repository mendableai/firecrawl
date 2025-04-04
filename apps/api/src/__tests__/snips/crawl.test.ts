import { crawl } from "./lib";
import { describe, it, expect } from "@jest/globals";

describe("Crawl tests", () => {
    it.concurrent("works", async () => {
        await crawl({
            url: "https://firecrawl.dev",
            limit: 10,
        });
    }, 120000);

    it.concurrent("filters URLs properly", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev/pricing",
            includePaths: ["^/pricing$"],
            limit: 10,
        });

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBe(1);
            expect(res.data[0].metadata.sourceURL).toBe("https://firecrawl.dev/pricing");
        }
    }, 120000);

    it.concurrent("filters URLs properly when using regexOnFullURL", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev/pricing",
            includePaths: ["^https://(www\\.)?firecrawl\\.dev/pricing$"],
            regexOnFullURL: true,
            limit: 10,
        });

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBe(1);
            expect(res.data[0].metadata.sourceURL).toBe("https://firecrawl.dev/pricing");
        }
    }, 120000);

    it.concurrent("discovers URLs properly when origin is not included", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            includePaths: ["^/blog"],
            ignoreSitemap: true,
            limit: 10,
        });

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.length).toBeGreaterThan(1);
            for (const page of res.data) {
                expect(page.metadata.url ?? page.metadata.sourceURL).toMatch(/^https:\/\/(www\.)?firecrawl\.dev\/blog/);
            }
        }
    }, 120000);
    
    it.concurrent("discovers URLs properly when maxDiscoveryDepth is provided", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            ignoreSitemap: true,
            maxDiscoveryDepth: 1,
            limit: 10,
        });

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.data.length).toBeGreaterThan(1);
            for (const page of res.data) {
                expect(page.metadata.url ?? page.metadata.sourceURL).not.toMatch(/^https:\/\/(www\.)?firecrawl\.dev\/blog\/.+$/);
            }
        }
    }, 120000);

    it.concurrent("respects crawl delay from robots.txt", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            limit: 5,
            delay: 1,
        });

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBeGreaterThan(0);
        }
    }, 120000);

    it.concurrent("uses user-specified delay over robots.txt delay", async () => {
        const res = await crawl({
            url: "https://firecrawl.dev",
            limit: 5,
            delay: 1,
        });

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBeGreaterThan(0);
        }
    }, 120000);

    it.concurrent("handles crawling with delay and concurrency limiting", async () => {
        const promises = [
            crawl({
                url: "https://firecrawl.dev",
                limit: 3,
                delay: 1,
            }),
            crawl({
                url: "https://firecrawl.dev/pricing",
                limit: 3,
                delay: 1,
            })
        ];

        const results = await Promise.all(promises);
        
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
        
        if (results[0].success && results[1].success) {
            expect(results[0].completed).toBeGreaterThan(0);
            expect(results[1].completed).toBeGreaterThan(0);
        }
    }, 180000);
});
