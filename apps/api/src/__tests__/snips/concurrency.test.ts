import { concurrencyCheck, crawlWithConcurrencyTracking } from "./lib";

let accountConcurrencyLimit = 2;

beforeAll(async () => {
    const { maxConcurrency } = await concurrencyCheck();
    accountConcurrencyLimit = maxConcurrency;
    console.log("Account concurrency limit:", accountConcurrencyLimit);
}, 10000);

describe("Concurrency queue and limit", () => {
    it("crawl utilizes full concurrency limit and doesn't go over", async () => {
        const { crawl, concurrencies } = await crawlWithConcurrencyTracking({
            url: "https://firecrawl.dev",
            limit: accountConcurrencyLimit * 2,
        });

        expect(Math.max(...concurrencies)).toBe(accountConcurrencyLimit);
    }, 600000);

    it("crawl handles maxConcurrency properly", async () => {
        const { crawl, concurrencies } = await crawlWithConcurrencyTracking({
            url: "https://firecrawl.dev",
            limit: 15,
            maxConcurrency: 5,
        });

        expect(Math.max(...concurrencies)).toBe(5);
    }, 600000);
});