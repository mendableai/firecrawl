import { cacheKey, getEntryFromCache } from "../../../../lib/cache";
import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { EngineError } from "../../error";

export async function scrapeCache(meta: Meta): Promise<EngineScrapeResult> {
  const key = cacheKey(meta.url, meta.options, meta.internalOptions);
  if (key === null) throw new EngineError("Scrape not eligible for caching");

  const entry = await getEntryFromCache(key);
  if (entry === null) throw new EngineError("Cache missed");

  return {
    url: entry.url,
    html: entry.html,
    statusCode: entry.statusCode,
    error: entry.error,
  };
}
