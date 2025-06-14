import { batchScrapeWithConcurrencyTracking, concurrencyCheck, crawlWithConcurrencyTracking, defaultIdentity, Identity } from "./lib";

const concurrencyIdentity: Identity = {
    apiKey: process.env.TEST_API_KEY_CONCURRENCY ?? process.env.TEST_API_KEY!,
}

if (!process.env.TEST_SUITE_SELF_HOSTED) {
    let accountConcurrencyLimit = 2;

    beforeAll(async () => {
        const { maxConcurrency } = await concurrencyCheck(concurrencyIdentity);
        accountConcurrencyLimit = maxConcurrency;

        console.log("Account concurrency limit:", accountConcurrencyLimit);

        if (accountConcurrencyLimit > 20) {
            console.warn("Your account's concurrency limit (" + accountConcurrencyLimit + ") is likely too high, which will cause these tests to fail. Please set up TEST_API_KEY_CONCURRENCY with an API key that has a lower concurrency limit.");
        }
    }, 10000);
    
    describe("Concurrency queue and limit", () => {
        it("crawl utilizes full concurrency limit and doesn't go over", async () => {
            const limit = accountConcurrencyLimit * 2;
    
            const { crawl, concurrencies } = await crawlWithConcurrencyTracking({
                url: "https://firecrawl.dev",
                limit,
            }, concurrencyIdentity);
    
            expect(Math.max(...concurrencies)).toBe(accountConcurrencyLimit);
            expect(crawl.completed).toBe(limit);
        }, 600000);
    
        it("crawl handles maxConcurrency properly", async () => {
            const { crawl, concurrencies } = await crawlWithConcurrencyTracking({
                url: "https://firecrawl.dev",
                limit: 15,
                maxConcurrency: 5,
            }, concurrencyIdentity);
    
            expect(Math.max(...concurrencies)).toBe(5);
            expect(crawl.completed).toBe(15);
        }, 600000);
    
        it("crawl maxConcurrency stacks properly", async () => {
            const [{ crawl: crawl1, concurrencies: concurrencies1 }, { crawl: crawl2, concurrencies: concurrencies2 }] = await Promise.all([
                crawlWithConcurrencyTracking({
                    url: "https://firecrawl.dev",
                    limit: 15,
                    maxConcurrency: 5,
                }, concurrencyIdentity),
                crawlWithConcurrencyTracking({
                    url: "https://firecrawl.dev",
                    limit: 15,
                    maxConcurrency: 5,
                }, concurrencyIdentity),
            ]);
    
            expect(Math.max(...concurrencies1, ...concurrencies2)).toBe(10);
            expect(crawl1.completed).toBe(15);
            expect(crawl2.completed).toBe(15);
        }, 1200000);

        it("batch scrape utilizes full concurrency limit and doesn't go over", async () => {
            const limit = accountConcurrencyLimit * 2;
    
            const { batchScrape, concurrencies } = await batchScrapeWithConcurrencyTracking({
                urls: Array(limit).fill(0).map(_ => `https://firecrawl.dev`),
            }, concurrencyIdentity);
    
            expect(Math.max(...concurrencies)).toBe(accountConcurrencyLimit);
            expect(batchScrape.completed).toBe(limit);
        }, 600000);
    
        it("batch scrape handles maxConcurrency properly", async () => {
            const { batchScrape, concurrencies } = await batchScrapeWithConcurrencyTracking({
                urls: Array(15).fill(0).map(_ => `https://firecrawl.dev`),
                maxConcurrency: 5,
            }, concurrencyIdentity);
    
            expect(Math.max(...concurrencies)).toBe(5);
            expect(batchScrape.completed).toBe(15);
        }, 600000);
    
        it("batch scrape maxConcurrency stacks properly", async () => {
            const [{ batchScrape: batchScrape1, concurrencies: concurrencies1 }, { batchScrape: batchScrape2, concurrencies: concurrencies2 }] = await Promise.all([
                batchScrapeWithConcurrencyTracking({
                    urls: Array(15).fill(0).map(_ => `https://firecrawl.dev`),
                    maxConcurrency: 5,
                }, concurrencyIdentity),
                batchScrapeWithConcurrencyTracking({
                    urls: Array(15).fill(0).map(_ => `https://firecrawl.dev`),
                    maxConcurrency: 5,
                }, concurrencyIdentity),
            ]);
    
            expect(Math.max(...concurrencies1, ...concurrencies2)).toBe(10);
            expect(batchScrape1.completed).toBe(15);
            expect(batchScrape2.completed).toBe(15);
        }, 1200000);
    });    
} else {
    it("stubbed", () => {
        expect(true).toBe(true);
    });
}
