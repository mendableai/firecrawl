// search/providers/SerperProvider.ts
import axios from "axios";
import { SearchResult, SearchProvider, SearchOptions } from "../types";

export class SerperProvider implements SearchProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const data = {
      q: options.q,
      hl: options.lang,
      gl: options.country,
      location: options.location,
      tbs: options.tbs,
      num: options.num_results,
      page: options.page ?? 1,
    };

    const response = await axios.post(
      "https://google.serper.dev/search",
      data,
      {
        headers: {
          "X-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data && Array.isArray(response.data.organic)) {
      return response.data.organic.map((item: any) => ({
        url: item.link,
        title: item.title,
        description: item.snippet,
      }));
    }
    return [];
  }
}
