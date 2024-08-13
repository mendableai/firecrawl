import { WebCrawler } from "../scraper/WebScraper/crawler";
import { redisConnection } from "../services/queue-service";

export type StoredCrawl = {
    originUrl: string;
    crawlerOptions: any;
    pageOptions: any;
    team_id: string;
    robots?: string;
    cancelled?: boolean;
};

export async function saveCrawl(id: string, crawl: StoredCrawl) {
    await redisConnection.set("crawl:" + id, JSON.stringify(crawl));
    await redisConnection.expire("crawl:" + id, 24 * 60 * 60, "NX");
}

export async function getCrawl(id: string): Promise<StoredCrawl | null> {
    const x = await redisConnection.get("crawl:" + id);

    if (x === null) {
        return null;
    }

    return JSON.parse(x);
}

export async function addCrawlJob(id: string, job_id: string) {
    await redisConnection.sadd("crawl:" + id + ":jobs", job_id);
    await redisConnection.expire("crawl:" + id + ":jobs", 24 * 60 * 60, "NX");
}

export async function getCrawlJobs(id: string): Promise<string[]> {
    return await redisConnection.smembers("crawl:" + id + ":jobs");
}

export async function lockURL(id: string, sc: StoredCrawl, url: string): Promise<boolean> {
    if (typeof sc.crawlerOptions?.limit === "number") {
        if (await redisConnection.scard("crawl:" + id + ":visited") >= sc.crawlerOptions.limit) {
            return false;
        }
    }
    const res = (await redisConnection.sadd("crawl:" + id + ":visited", url)) !== 0
    await redisConnection.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");
    return res;
}

export function crawlToCrawler(id: string, sc: StoredCrawl): WebCrawler {
    const crawler = new WebCrawler({
        jobId: id,
        initialUrl: sc.originUrl,
        includes: sc.crawlerOptions?.includes ?? [],
        excludes: sc.crawlerOptions?.excludes ?? [],
        maxCrawledLinks: sc.crawlerOptions?.maxCrawledLinks ?? 1000,
        maxCrawledDepth: sc.crawlerOptions?.maxDepth ?? 10,
        limit: sc.crawlerOptions?.limit ?? 10000,
        generateImgAltText: sc.crawlerOptions?.generateImgAltText ?? false,
        allowBackwardCrawling: sc.crawlerOptions?.allowBackwardCrawling ?? false,
        allowExternalContentLinks: sc.crawlerOptions?.allowExternalContentLinks ?? false,
    });

    if (sc.robots !== undefined) {
        try {
            crawler.importRobotsTxt(sc.robots);
        } catch (_) {}
    }

    return crawler;
}
