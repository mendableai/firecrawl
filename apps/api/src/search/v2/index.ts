import { logger } from "../../lib/logger";
import { SearchV2Response, SearchResultType } from "../../lib/entities";
import { fire_engine_search_v2 } from "./fireEngine-v2";
import { serper_search } from "./serper";
import { searchapi_search } from "./searchapi";
import { searxng_search } from "./searxng";
import { googleSearch } from "./googlesearch";

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
  type = undefined,
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
  type?: SearchResultType | SearchResultType[];
}): Promise<SearchV2Response> {
  try {
    if (process.env.FIRE_ENGINE_BETA_URL) {
      const results = await fire_engine_search_v2(query, {
        numResults: num_results,
        tbs,
        filter,
        lang,
        country,
        location,
        type,
      });
      
      return results;
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
      if (results.web && results.web.length > 0) return results;
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
      if (results.web && results.web.length > 0) return results;
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
      if (results.web && results.web.length > 0) return results;
    }
    
    const googleResults = await googleSearch(
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
    if (googleResults.web && googleResults.web.length > 0) return googleResults;
    
    // Fallback to empty response
    return {};
  } catch (error) {
    logger.error(`Error in search function`, { error });
    return {};
  }
}
