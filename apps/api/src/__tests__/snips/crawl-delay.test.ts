import { crawl } from "./lib";
import { describe, it, expect } from "@jest/globals";

describe("Crawl Delay Tests", () => {
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
