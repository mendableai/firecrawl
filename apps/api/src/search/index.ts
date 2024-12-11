import { logger } from "../../src/lib/logger";
import { SearchResult } from "../../src/lib/entities";
import { ProviderFactory } from "./providerFactory";
import { SearchOptions, ProviderType} from "./types";

export async function search({
  query,
  num_results = 7,
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
    // TODO: Ideally we should receive the provider type from the request
    let providerType = ProviderType.GOOGLE; // Default provider
    if (process.env.SERPER_API_KEY) {
      providerType = ProviderType.SERPER;
    } else if (process.env.SEARCHAPI_API_KEY) {
      providerType = ProviderType.SEARCHAPI;
    }

    const provider = ProviderFactory.createProvider(providerType);

    const searchOptions: SearchOptions = {
      q: query,
      num_results,
      lang,
      country,
      location,
      tbs,
      filter,
      proxies: proxy ? { https: proxy } : undefined,
      sleep_interval,
      timeout,
    };

    return await provider.search(searchOptions);
  } catch (error) {
    logger.error(`Error in search function: ${error.message}`);
    return [];
  }
}
