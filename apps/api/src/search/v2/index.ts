import { logger } from "../../lib/logger";
import { SearchResult, SearchV2Response, SearchResultType } from "../../lib/entities";
import { fire_engine_search, fire_engine_search_v2 } from "./fireEngine-v2";

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
    
    // Fallback to empty response
    return {};
    
    // if (process.env.SERPER_API_KEY) {
    //   const results = await serper_search(query, {
    //     num_results,
    //     tbs,
    //     filter,
    //     lang,
    //     country,
    //     location,
    //   });
    //   if (results.length > 0) return results;
    // }
    // if (process.env.SEARCHAPI_API_KEY) {
    //   const results = await searchapi_search(query, {
    //     num_results,
    //     tbs,
    //     filter,
    //     lang,
    //     country,
    //     location,
    //   });
    //   if (results.length > 0) return results;
    // }
    // if (process.env.SEARXNG_ENDPOINT) {
    //   const results = await searxng_search(query, {
    //     num_results,
    //     tbs,
    //     filter,
    //     lang,
    //     country,
    //     location,
    //   });
    //   if (results.length > 0) return results;
    // }
    // return await googleSearch(
    //   query,
    //   advanced,
    //   num_results,
    //   tbs,
    //   filter,
    //   lang,
    //   country,
    //   proxy,
    //   sleep_interval,
    //   timeout,
    // );
  } catch (error) {
    logger.error(`Error in search function`, { error });
    return {};
  }
}
