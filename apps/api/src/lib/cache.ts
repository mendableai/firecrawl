import IORedis from "ioredis";
import { ScrapeOptions } from "../controllers/v1/types";
import { InternalOptions } from "../scraper/scrapeURL";
import { logger as _logger } from "./logger";
const logger = _logger.child({ module: "cache" });

export const cacheRedis = process.env.CACHE_REDIS_URL
  ? new IORedis(process.env.CACHE_REDIS_URL, {
      maxRetriesPerRequest: null,
    })
  : null;

export function cacheKey(
  url: string,
  scrapeOptions: ScrapeOptions,
  internalOptions: InternalOptions,
): string | null {
  if (!cacheRedis) return null;

  // these options disqualify a cache
  if (
    internalOptions.v0CrawlOnlyUrls ||
    internalOptions.forceEngine ||
    scrapeOptions.fastMode ||
    internalOptions.atsv ||
    (scrapeOptions.actions && scrapeOptions.actions.length > 0)
  ) {
    return null;
  }

  return "cache:" + url + ":waitFor:" + scrapeOptions.waitFor;
}

export type CacheEntry = {
  url: string;
  html: string;
  statusCode: number;
  error?: string;
};

export async function saveEntryToCache(key: string, entry: CacheEntry) {
  if (!cacheRedis) return;

  try {
    await cacheRedis.set(key, JSON.stringify(entry));
  } catch (error) {
    logger.warn("Failed to save to cache", { key, error });
  }
}

export async function getEntryFromCache(
  key: string,
): Promise<CacheEntry | null> {
  if (!cacheRedis) return null;

  try {
    return JSON.parse((await cacheRedis.get(key)) ?? "null");
  } catch (error) {
    logger.warn("Failed to get from cache", { key, error });
    return null;
  }
}
