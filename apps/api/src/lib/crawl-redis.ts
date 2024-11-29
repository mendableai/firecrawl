import { InternalOptions } from "../scraper/scrapeURL";
import { ScrapeOptions } from "../controllers/v1/types";
import { WebCrawler } from "../scraper/WebScraper/crawler";
import { redisConnection } from "../services/queue-service";
import { logger } from "./logger";
import { getAdjustedMaxDepth } from "../scraper/WebScraper/utils/maxDepthUtils";

export type StoredCrawl = {
    originUrl?: string;
    crawlerOptions: any;
    scrapeOptions: Omit<ScrapeOptions, "timeout">;
    internalOptions: InternalOptions;
    team_id: string;
    plan?: string;
    robots?: string;
    cancelled?: boolean;
    createdAt: number;
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

export async function getCrawlExpiry(id: string): Promise<Date> {
    const d = new Date();
    const ttl = await redisConnection.pttl("crawl:" + id);
    d.setMilliseconds(d.getMilliseconds() + ttl);
    d.setMilliseconds(0);
    return d;
}

export async function addCrawlJob(id: string, job_id: string) {
    await redisConnection.sadd("crawl:" + id + ":jobs", job_id);
    await redisConnection.expire("crawl:" + id + ":jobs", 24 * 60 * 60, "NX");
}

export async function addCrawlJobs(id: string, job_ids: string[]) {
    await redisConnection.sadd("crawl:" + id + ":jobs", ...job_ids);
    await redisConnection.expire("crawl:" + id + ":jobs", 24 * 60 * 60, "NX");
}

export async function addCrawlJobDone(id: string, job_id: string) {
    await redisConnection.sadd("crawl:" + id + ":jobs_done", job_id);
    await redisConnection.rpush("crawl:" + id + ":jobs_done_ordered", job_id);
    await redisConnection.expire("crawl:" + id + ":jobs_done", 24 * 60 * 60, "NX");
    await redisConnection.expire("crawl:" + id + ":jobs_done_ordered", 24 * 60 * 60, "NX");
}

export async function getDoneJobsOrderedLength(id: string): Promise<number> {
    return await redisConnection.llen("crawl:" + id + ":jobs_done_ordered");
}

export async function getDoneJobsOrdered(id: string, start = 0, end = -1): Promise<string[]> {
    return await redisConnection.lrange("crawl:" + id + ":jobs_done_ordered", start, end);
}

export async function isCrawlFinished(id: string) {
    return (await redisConnection.scard("crawl:" + id + ":jobs_done")) === (await redisConnection.scard("crawl:" + id + ":jobs"));
}

export async function isCrawlFinishedLocked(id: string) {
    return (await redisConnection.exists("crawl:" + id + ":finish"));
}

export async function finishCrawl(id: string) {
    if (await isCrawlFinished(id)) {
        const set = await redisConnection.setnx("crawl:" + id + ":finish", "yes");
        if (set === 1) {
            await redisConnection.expire("crawl:" + id + ":finish", 24 * 60 * 60);
        }
        return set === 1
    }
}

export async function getCrawlJobs(id: string): Promise<string[]> {
    return await redisConnection.smembers("crawl:" + id + ":jobs");
}

export async function getThrottledJobs(teamId: string): Promise<string[]> {
    return await redisConnection.zrangebyscore("concurrency-limiter:" + teamId + ":throttled", Date.now(), Infinity);
}

export function normalizeURL(url: string, sc: StoredCrawl): string {
    const urlO = new URL(url);
    if (!sc.crawlerOptions || sc.crawlerOptions.ignoreQueryParameters) {
        urlO.search = "";
    }
    urlO.hash = "";
    return urlO.href;
}

export function generateURLPermutations(url: string | URL): URL[] {
    const urlO = new URL(url);

    // Construct two versions, one with www., one without
    const urlWithWWW = new URL(urlO);
    const urlWithoutWWW = new URL(urlO);
    if (urlO.hostname.startsWith("www.")) {
        urlWithoutWWW.hostname = urlWithWWW.hostname.slice(4);
    } else {
        urlWithWWW.hostname = "www." + urlWithoutWWW.hostname;
    }

    let permutations = [urlWithWWW, urlWithoutWWW];

    // Construct more versions for http/https
    permutations = permutations.flatMap(urlO => {
        if (!["http:", "https:"].includes(urlO.protocol)) {
            return [urlO];
        }

        const urlWithHTTP = new URL(urlO);
        const urlWithHTTPS = new URL(urlO);
        urlWithHTTP.protocol = "http:";
        urlWithHTTPS.protocol = "https:";

        return [urlWithHTTP, urlWithHTTPS];
    });

    return permutations;
}

export async function lockURL(id: string, sc: StoredCrawl, url: string): Promise<boolean> {
    if (typeof sc.crawlerOptions?.limit === "number") {
        if (await redisConnection.scard("crawl:" + id + ":visited_unique") >= sc.crawlerOptions.limit) {
            return false;
        }
    }

    url = normalizeURL(url, sc);

    await redisConnection.sadd("crawl:" + id + ":visited_unique", url);
    await redisConnection.expire("crawl:" + id + ":visited_unique", 24 * 60 * 60, "NX");

    let res: boolean;
    if (!sc.crawlerOptions?.deduplicateSimilarURLs) {
        res = (await redisConnection.sadd("crawl:" + id + ":visited", url)) !== 0
    } else {
        const permutations = generateURLPermutations(url);
        const x = (await redisConnection.sadd("crawl:" + id + ":visited", ...permutations.map(x => x.href)));
        res = x === permutations.length;
    }

    await redisConnection.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");
    return res;
}

/// NOTE: does not check limit. only use if limit is checked beforehand e.g. with sitemap
export async function lockURLs(id: string, sc: StoredCrawl, urls: string[]): Promise<boolean> {
    urls = urls.map(url => {
        return normalizeURL(url, sc);
    });
    
    const res = (await redisConnection.sadd("crawl:" + id + ":visited", ...urls)) !== 0
    await redisConnection.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");
    return res;
}

export function crawlToCrawler(id: string, sc: StoredCrawl, newBase?: string): WebCrawler {
    const crawler = new WebCrawler({
        jobId: id,
        initialUrl: sc.originUrl!,
        baseUrl: newBase ? new URL(newBase).origin : undefined,
        includes: sc.crawlerOptions?.includes ?? [],
        excludes: sc.crawlerOptions?.excludes ?? [],
        maxCrawledLinks: sc.crawlerOptions?.maxCrawledLinks ?? 1000,
        maxCrawledDepth: getAdjustedMaxDepth(sc.originUrl!, sc.crawlerOptions?.maxDepth ?? 10),
        limit: sc.crawlerOptions?.limit ?? 10000,
        generateImgAltText: sc.crawlerOptions?.generateImgAltText ?? false,
        allowBackwardCrawling: sc.crawlerOptions?.allowBackwardCrawling ?? false,
        allowExternalContentLinks: sc.crawlerOptions?.allowExternalContentLinks ?? false,
        allowSubdomains: sc.crawlerOptions?.allowSubdomains ?? false,
        ignoreRobotsTxt: sc.crawlerOptions?.ignoreRobotsTxt ?? false,
    });

    if (sc.robots !== undefined) {
        try {
            crawler.importRobotsTxt(sc.robots);
        } catch (_) {}
    }

    return crawler;
}
