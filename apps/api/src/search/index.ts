import { logger } from "../../src/lib/logger";
import { SearchResult } from "../../src/lib/entities";
import { googleSearch } from "./googlesearch";
import { searchapi_search } from "./searchapi";
import { serper_search } from "./serper";
import { searxng_search } from "./searxng";
import { fire_engine_search } from "./fireEngine";

export async function search({
  query,
  advanced = false,
  num_results = 5,
  tbs = undefined,
  filter = undefined,
  lang = "en",
  country = "us",
  location = undefined,
  proxy = undefined,
  sleep_interval = 0,
  timeout = 5000,
}: {
  query: string;
  advanced?: boolean;
  num_results?: number;
  tbs?: string;
  filter?: string;
  lang?: string;
  country?: string;
  location?: string;
  proxy?: string;
  sleep_interval?: number;
  timeout?: number;
}): Promise<SearchResult[]> {
  try {
    if (process.env.FIRE_ENGINE_BETA_URL) {
      const results = await fire_engine_search(query, {
        numResults: num_results,
        tbs,
        filter,
        lang,
        country,
        location,
      });
      if (results.length > 0) return results;
    }
    if (process.env.SERPER_API_KEY) {
      const results = await serper_search(query, {
        num_results,
        tbs,
        filter,
        lang,
        country,
        location,
      });
      if (results.length > 0) return results;
    }
    if (process.env.SEARCHAPI_API_KEY) {
      const results = await searchapi_search(query, {
        num_results,
        tbs,
        filter,
        lang,
        country,
        location,
      });
      if (results.length > 0) return results;
    }
    if (process.env.SEARXNG_ENDPOINT) {
      const results = await searxng_search(query, {
        num_results,
        tbs,
        filter,
        lang,
        country,
        location,
      });
      if (results.length > 0) return results;
    }
    return await googleSearch(
      query,
      advanced,
      num_results,
      tbs,
      filter,
      lang,
      country,
      proxy,
      sleep_interval,
      timeout,
    );
  } catch (error) {
    logger.error(`Error in search function`, { error });
    return [];
  }
}
