import axios from "axios";
import { SearchResult, SearchProvider, SearchOptions } from "../types";
import { parseGoogleSearchResults } from "../utils/googleDomParser";

export class GoogleScraperProvider implements SearchProvider {
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const maxAttempts = 20; // Define a maximum number of attempts to prevent infinite loop
    const sleepInterval = options.sleep_interval ?? 0;
    const timeout = options.timeout ?? 5000;

    let start = 0;
    let attempts = 0;
    const results: SearchResult[] = [];

    while (start < options.num_results && attempts < maxAttempts) {
      try {
        const response = await this._req(
          options.q,
          options.num_results - start,
          options.lang ?? "en",
          options.country ?? "us",
          start,
          options.proxies,
          timeout,
          options.tbs,
          options.filter,
        );

        const pageResults = parseGoogleSearchResults(response.data);
        if (pageResults.length === 0) {
          attempts += 1;
        } else {
          attempts = 0; // Reset attempts if we have results
        }

        results.push(...pageResults);
        start += pageResults.length;

        await this._sleep(sleepInterval); // Pause before the next request
      } catch (error) {
        if (
          error.message.includes("Too many requests") ||
          (error.response && error.response.status === 429)
        ) {
          console.warn(
            "GoogleScraperProvider: Too many requests, breaking the loop.",
          );
          break;
        }
        console.error(
          `GoogleScraperProvider: Error during scraping - ${error.message}`,
        );
        throw error;
      }
    }

    if (attempts >= maxAttempts) {
      console.warn(
        "GoogleScraperProvider: Max attempts reached, exiting loop.",
      );
    }

    return results.slice(0, options.num_results); // Ensure we return the correct number of results
  }

  private async _req(
    term: string,
    results: number,
    lang: string,
    country: string,
    start: number,
    proxies: any,
    timeout: number,
    tbs?: string,
    filter?: string,
  ): Promise<any> {
    const params: Record<string, any> = {
      q: term,
      num: results,
      hl: lang,
      gl: country,
      start,
    };

    if (tbs) params.tbs = tbs;
    if (filter) params.filter = filter;
    let proxy: any = null
    if (proxies) {
      proxy = proxies.startsWith("https")
        ? { https: proxies }
        : { http: proxies };
    }

    return axios.get("https://www.google.com/search", {
      headers: {
        "User-Agent": this._getRandomUserAgent(),
      },
      params,
      proxy,
      timeout,
    });
  }

  private _getRandomUserAgent(): string {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.1661.62",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0",
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  private async _sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
