import { crawl } from "./lib";

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
            includePaths: ["^https://firecrawl.dev/pricing$"],
            regexOnFullURL: true,
            limit: 10,
        });

        expect(res.success).toBe(true);
        if (res.success) {
            expect(res.completed).toBe(1);
            expect(res.data[0].metadata.sourceURL).toBe("https://firecrawl.dev/pricing");
        }
    }, 120000);
});
