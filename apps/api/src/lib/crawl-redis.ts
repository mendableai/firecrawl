import { InternalOptions } from "../scraper/scrapeURL";
import { ScrapeOptions } from "../controllers/v1/types";
import { WebCrawler } from "../scraper/WebScraper/crawler";
import { redisConnection } from "../services/queue-service";
import { logger as _logger } from "./logger";
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
  _logger.debug("Saving crawl " + id + " to Redis...", {
    crawl,
    module: "crawl-redis",
    method: "saveCrawl",
    crawlId: id,
    teamId: crawl.team_id,
    plan: crawl.plan,
  });
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
  _logger.debug("Adding crawl job " + job_id + " to Redis...", {
    jobId: job_id,
    module: "crawl-redis",
    method: "addCrawlJob",
    crawlId: id,
  });
  await redisConnection.sadd("crawl:" + id + ":jobs", job_id);
  await redisConnection.expire("crawl:" + id + ":jobs", 24 * 60 * 60, "NX");
}

export async function addCrawlJobs(id: string, job_ids: string[]) {
  if (job_ids.length === 0) return true;

  _logger.debug("Adding crawl jobs to Redis...", {
    jobIds: job_ids,
    module: "crawl-redis",
    method: "addCrawlJobs",
    crawlId: id,
  });
  await redisConnection.sadd("crawl:" + id + ":jobs", ...job_ids);
  await redisConnection.expire("crawl:" + id + ":jobs", 24 * 60 * 60, "NX");
}

export async function addCrawlJobDone(
  id: string,
  job_id: string,
  success: boolean,
) {
  _logger.debug("Adding done crawl job to Redis...", {
    jobId: job_id,
    module: "crawl-redis",
    method: "addCrawlJobDone",
    crawlId: id,
  });
  await redisConnection.sadd("crawl:" + id + ":jobs_done", job_id);
  await redisConnection.expire(
    "crawl:" + id + ":jobs_done",
    24 * 60 * 60,
    "NX",
  );

  if (success) {
    await redisConnection.rpush("crawl:" + id + ":jobs_done_ordered", job_id);
  } else {
    // in case it's already been pushed, make sure it's removed
    await redisConnection.lrem(
      "crawl:" + id + ":jobs_done_ordered",
      -1,
      job_id,
    );
  }

  await redisConnection.expire(
    "crawl:" + id + ":jobs_done_ordered",
    24 * 60 * 60,
    "NX",
  );
}

export async function getDoneJobsOrderedLength(id: string): Promise<number> {
  return await redisConnection.llen("crawl:" + id + ":jobs_done_ordered");
}

export async function getDoneJobsOrdered(
  id: string,
  start = 0,
  end = -1,
): Promise<string[]> {
  return await redisConnection.lrange(
    "crawl:" + id + ":jobs_done_ordered",
    start,
    end,
  );
}

export async function isCrawlFinished(id: string) {
  return (
    (await redisConnection.scard("crawl:" + id + ":jobs_done")) ===
    (await redisConnection.scard("crawl:" + id + ":jobs"))
  );
}

export async function isCrawlFinishedLocked(id: string) {
  return await redisConnection.exists("crawl:" + id + ":finish");
}

export async function finishCrawl(id: string) {
  if (await isCrawlFinished(id)) {
    _logger.debug("Marking crawl as finished.", {
      module: "crawl-redis",
      method: "finishCrawl",
      crawlId: id,
    });
    const set = await redisConnection.setnx("crawl:" + id + ":finish", "yes");
    if (set === 1) {
      await redisConnection.expire("crawl:" + id + ":finish", 24 * 60 * 60);
    }
    return set === 1;
  } else {
    _logger.debug("Crawl can not be finished yet, not marking as finished.", {
      module: "crawl-redis",
      method: "finishCrawl",
      crawlId: id,
    });
  }
}

export async function getCrawlJobs(id: string): Promise<string[]> {
  return await redisConnection.smembers("crawl:" + id + ":jobs");
}

export async function getThrottledJobs(teamId: string): Promise<string[]> {
  return await redisConnection.zrangebyscore(
    "concurrency-limiter:" + teamId + ":throttled",
    Date.now(),
    Infinity,
  );
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
  permutations = permutations.flatMap((urlO) => {
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

export async function lockURL(
  id: string,
  sc: StoredCrawl,
  url: string,
): Promise<boolean> {
  let logger = _logger.child({
    crawlId: id,
    module: "crawl-redis",
    method: "lockURL",
    preNormalizedURL: url,
    teamId: sc.team_id,
    plan: sc.plan,
  });

  if (typeof sc.crawlerOptions?.limit === "number") {
    if (
      (await redisConnection.scard("crawl:" + id + ":visited_unique")) >=
      sc.crawlerOptions.limit
    ) {
      logger.debug(
        "Crawl has already hit visited_unique limit, not locking URL.",
      );
      return false;
    }
  }

  url = normalizeURL(url, sc);
  logger = logger.child({ url });

  let res: boolean;
  if (!sc.crawlerOptions?.deduplicateSimilarURLs) {
    res = (await redisConnection.sadd("crawl:" + id + ":visited", url)) !== 0;
  } else {
    const permutations = generateURLPermutations(url).map((x) => x.href);
    // logger.debug("Adding URL permutations for URL " + JSON.stringify(url) + "...", { permutations });
    const x = await redisConnection.sadd(
      "crawl:" + id + ":visited",
      ...permutations,
    );
    res = x === permutations.length;
  }

  await redisConnection.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");

  if (res) {
    await redisConnection.sadd("crawl:" + id + ":visited_unique", url);
    await redisConnection.expire(
      "crawl:" + id + ":visited_unique",
      24 * 60 * 60,
      "NX",
    );
  }

  logger.debug("Locking URL " + JSON.stringify(url) + "... result: " + res, {
    res,
  });
  return res;
}

/// NOTE: does not check limit. only use if limit is checked beforehand e.g. with sitemap
export async function lockURLs(
  id: string,
  sc: StoredCrawl,
  urls: string[],
): Promise<boolean> {
  if (urls.length === 0) return true;

  urls = urls.map((url) => normalizeURL(url, sc));
  const logger = _logger.child({
    crawlId: id,
    module: "crawl-redis",
    method: "lockURL",
    teamId: sc.team_id,
    plan: sc.plan,
  });

  // Add to visited_unique set
  logger.debug("Locking " + urls.length + " URLs...");
  await redisConnection.sadd("crawl:" + id + ":visited_unique", ...urls);
  await redisConnection.expire(
    "crawl:" + id + ":visited_unique",
    24 * 60 * 60,
    "NX",
  );

  let res: boolean;
  if (!sc.crawlerOptions?.deduplicateSimilarURLs) {
    const x = await redisConnection.sadd("crawl:" + id + ":visited", ...urls);
    res = x === urls.length;
  } else {
    const allPermutations = urls.flatMap((url) =>
      generateURLPermutations(url).map((x) => x.href),
    );
    logger.debug("Adding " + allPermutations.length + " URL permutations...");
    const x = await redisConnection.sadd(
      "crawl:" + id + ":visited",
      ...allPermutations,
    );
    res = x === allPermutations.length;
  }

  await redisConnection.expire("crawl:" + id + ":visited", 24 * 60 * 60, "NX");

  logger.debug("lockURLs final result: " + res, { res });
  return res;
}

export function crawlToCrawler(
  id: string,
  sc: StoredCrawl,
  newBase?: string,
): WebCrawler {
  const crawler = new WebCrawler({
    jobId: id,
    initialUrl: sc.originUrl!,
    baseUrl: newBase ? new URL(newBase).origin : undefined,
    includes: sc.crawlerOptions?.includes ?? [],
    excludes: sc.crawlerOptions?.excludes ?? [],
    maxCrawledLinks: sc.crawlerOptions?.maxCrawledLinks ?? 1000,
    maxCrawledDepth: getAdjustedMaxDepth(
      sc.originUrl!,
      sc.crawlerOptions?.maxDepth ?? 10,
    ),
    limit: sc.crawlerOptions?.limit ?? 10000,
    generateImgAltText: sc.crawlerOptions?.generateImgAltText ?? false,
    allowBackwardCrawling: sc.crawlerOptions?.allowBackwardCrawling ?? false,
    allowExternalContentLinks:
      sc.crawlerOptions?.allowExternalContentLinks ?? false,
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
