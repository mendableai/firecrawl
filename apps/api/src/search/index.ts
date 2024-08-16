import { Logger } from "../../src/lib/logger";
import { SearchResult } from "../../src/lib/entities";
import { googleSearch } from "./googlesearch";
import { fireEngineSearch } from "./fireEngine";

export async function search({
  query,
  advanced = false,
  num_results = 7,
  tbs = null,
  filter = null,
  lang = "en",
  country = "us",
  location = undefined,
  proxy = null,
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
}) : Promise<SearchResult[]> {
  try {
    if (process.env.FIRE_ENGINE_BETA_URL) {
      return await fireEngineSearch(query, {numResults: num_results, tbs, filter, lang, country, location});
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
      timeout
    );
  } catch (error) {
    Logger.error(`Error in search function: ${error}`);
    return []
  }
}
