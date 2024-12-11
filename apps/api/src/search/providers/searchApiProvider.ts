// search/providers/SearchApiProvider.ts
import axios from "axios";
import { SearchResult, SearchProvider, SearchOptions } from "../types";

export class SearchApiProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params = {
      q: options.q,
      hl: options.lang,
      gl: options.country,
      location: options.location,
      num: options.num_results,
      page: options.page ?? 1,
      filter: options.filter,
      engine: process.env.SEARCHAPI_ENGINE || "google",
    };

    const response = await axios.get("https://www.searchapi.io/api/v1/search", {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-SearchApi-Source": "Firecrawl",
      },
      params,
    });

    if (response.data && Array.isArray(response.data.organic_results)) {
      return response.data.organic_results.map((item: any) => ({
        url: item.link,
        title: item.title,
        description: item.snippet,
      }));
    }
    return [];
  }
}
