import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  CrawlParams,
  CrawlResponse,
  CrawlStatusResponse,
  FirecrawlAppConfig,
  FirecrawlDocument,
  MapParams,
  MapResponse,
  ScrapeParams,
  ScrapeResponse,
} from "./types";
import { getFetch } from "./utils/getFetch";
import { isZodSchema } from "./utils/isZodSchema";
import { FirecrawlApiError } from "./FirecrawlApiError";
import { CrawlWatcher } from "./CrawlWatcher";

/**
 * Main class for interacting with the Firecrawl API.
 * Provides methods for scraping, searching, crawling, and mapping web content.
 */
export class FirecrawlApp {
  public apiKey: string;
  public apiUrl: string;
  private fetch: typeof fetch;

  /**
   * Initializes a new instance of the FirecrawlApp class.
   * @param config - Configuration options for the FirecrawlApp instance.
   */
  constructor({ apiKey = null, apiUrl = null }: FirecrawlAppConfig) {
    if (typeof apiKey !== "string") {
      throw new Error("No API key provided");
    }

    this.apiKey = apiKey;
    this.apiUrl = apiUrl || "https://api.firecrawl.dev";
    this.fetch = getFetch();
  }

  /**
   * Scrapes a URL using the Firecrawl API.
   * @param url - The URL to scrape.
   * @param params - Additional parameters for the scrape request.
   * @returns The response from the scrape operation.
   */
  async scrapeUrl(url: string, params?: ScrapeParams): Promise<ScrapeResponse> {
    let body = { url, ...params };

    let schema = body.extract?.schema;

    if (schema && isZodSchema(schema)) {
      schema = zodToJsonSchema(schema);

      body = {
        ...body,
        extract: {
          ...body.extract,
          schema: schema,
        },
      };
    }

    const request = new Request(this.apiUrl + `/v1/scrape`, {
      method: "POST",
      headers: this.composeHeaders(),
      body: JSON.stringify(body),
    });

    // `fetch` will throw any network related errors
    // We don't need to worry about them since users can handle network errors themselves
    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(
        `Failed to scrape URL. Error: ${response.statusText}`,
        request,
        response,
      );
    }

    const data:
      | {
          success: true;
          warning?: string;
          error?: string;
          data?: FirecrawlDocument;
        }
      | { success: false; error: string } = await response.json();

    if (!data.success) {
      throw new FirecrawlApiError(
        `Failed to scrape URL. Error: ${data.error}`,
        request,
        response,
      );
    }

    return {
      success: true,
      warning: data.warning,
      ...data.data,
    };
  }

  /**
   * This method is intended to search for a query using the Firecrawl API. However, it is not supported in version 1 of the API.
   * @param query - The search query string.
   * @param params - Additional parameters for the search.
   * @returns Throws an error advising to use version 0 of the API.
   */
  async search(query: string, params?: any): Promise<any> {
    throw new Error(
      "Search is not supported in v1, please update FirecrawlApp() initialization to use v0.",
    );
  }

  /**
   * Initiates a crawl job for a URL using the Firecrawl API.
   * @param url - The URL to crawl.
   * @param params - Additional parameters for the crawl request.
   * @param pollInterval - Time in seconds for job status checks. Minimum 2 seconds.
   * @param idempotencyKey - Optional idempotency key for the request.
   * @returns The response from the crawl operation.
   */
  async crawlUrl(
    url: string,
    params?: CrawlParams,
    pollInterval: number = 2,
    idempotencyKey?: string,
  ): Promise<CrawlStatusResponse> {
    const request = new Request(this.apiUrl + `/v1/crawl`, {
      method: "POST",
      headers: this.composeHeaders(idempotencyKey),
      body: JSON.stringify({ url, ...params }),
    });

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(
        `Failed to crawl URL. Error: ${response.statusText}`,
        request,
        response,
      );
    }

    const data: { id: string } = await response.json();

    return this.monitorJobStatus(data.id, pollInterval, idempotencyKey);
  }

  async asyncCrawlUrl(
    url: string,
    params?: CrawlParams,
    idempotencyKey?: string,
  ): Promise<CrawlResponse> {
    // TODO: use `crawlUrl`
    const request = new Request(this.apiUrl + `/v1/crawl`, {
      method: "POST",
      headers: this.composeHeaders(idempotencyKey),
      body: JSON.stringify({ url, ...params }),
    });

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(
        `Failed to crawl URL. Error: ${response.statusText}`,
        request,
        response,
      );
    }

    return response.json();
  }

  /**
   * Checks the status of a crawl job using the Firecrawl API.
   * @param id - The ID of the crawl operation.
   * @param getAllData - Paginate through all the pages of documents, returning the full list of all documents. (default: `false`)
   * @returns The response containing the job status.
   */
  async checkCrawlStatus(
    id: string,
    getAllData = false,
  ): Promise<CrawlStatusResponse> {
    const request = new Request(this.apiUrl + `/v1/crawl/${id}`, {
      method: "GET",
      headers: this.composeHeaders(),
    });

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(
        `Failed to check crawl status. Error: ${response.statusText}`,
        request,
        response,
      );
    }

    const data: CrawlStatusResponse = await response.json();

    let allData = response.data.data;
    if (getAllData && response.data.status === "completed") {
      let statusData = response.data;
      if ("data" in statusData) {
        let data = statusData.data;
        while ("next" in statusData) {
          statusData = (await this.getRequest(statusData.next, headers)).data;
          data = data.concat(statusData.data);
        }
        allData = data;
      }
    }

    return {
      success: true,
      status: data.status,
      total: data.total,
      completed: data.completed,
      creditsUsed: data.creditsUsed,
      expiresAt: new Date(data.expiresAt),
      next: data.next,
      data: allData,
      error: data.error,
    };
  }

  async crawlUrlAndWatch(
    url: string,
    params?: CrawlParams,
    idempotencyKey?: string,
  ) {
    const { id } = await this.asyncCrawlUrl(url, params, idempotencyKey);

    // TODO is undefined id even possible?
    if (!id) {
      throw new Error("Crawl job failed to start: no crawl id returned");
    }

    return new CrawlWatcher(id, this);
  }

  /**
   * [ALPHA] Input a website and get all the urls on the website - extremly fast
   * 
   * The easiest way to go from a single url to a map of the entire website. This is extremely useful for:
   * - When you need to prompt the end-user to choose which links to scrape
   * - Need to quickly know the links on a website
   * - Need to scrape pages of a website that are related to a specific topic (use the search parameter)
   * - Only need to scrape specific pages of a website
​

   * @param url The URL to map
   * @param params Additional parameters for the map request.
   * @returns Most links present on the website.
   * 
   * @example
   * ```ts
   * const firecrawl = new FirecrawlApp({ apiKey: "YOUR_API_KEY" });
   * const result = await firecrawl.mapUrl("http://example.com");
   * ```
   */
  async mapUrl(url: string, params?: MapParams): Promise<MapResponse> {
    const request = new Request(this.apiUrl + `/v1/map`, {
      method: "POST",
      headers: this.composeHeaders(),
      body: JSON.stringify({ url, ...params }),
    });

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(
        `Failed to map URL. Error: ${response.statusText}`,
        request,
        response,
      );
    }

    return response.json();
  }

  /**
   * Composes the headers for an API request.
   * @param idempotencyKey - Optional key to ensure idempotency.
   * @returns The prepared headers.
   */
  private composeHeaders(idempotencyKey?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    };
  }

  /**
   * Monitors the status of a crawl job until completion or failure.
   * @param id - The ID of the crawl operation.
   * @param headers - The headers for the request.
   * @param checkInterval - Interval in seconds for job status checks.
   * @param checkUrl - Optional URL to check the status (used for v1 API)
   * @returns The final job status or data.
   */
  async monitorJobStatus(
    id: string,
    checkInterval: number,
    idempotencyKey?: string,
  ): Promise<CrawlStatusResponse> {
    while (true) {
      const request = new Request(this.apiUrl + `/v1/crawl/${id}`, {
        method: "GET",
        headers: this.composeHeaders(idempotencyKey),
      });

      const response = await this.fetch(request);

      if (!response.ok) {
        throw new FirecrawlApiError(
          `Failed to monitor crawl status. Error: ${response.statusText}`,
          request,
          response,
        );
      }

      let statusData = statusResponse.data;
      if (statusData.status === "completed") {
        if ("data" in statusData) {
          let data = statusData.data;
          while ("next" in statusData) {
            statusResponse = await this.getRequest(statusData.next, headers);
            statusData = statusResponse.data;
            data = data.concat(statusData.data);
          }
          statusData.data = data;
          return statusData;
        } else {
          throw new Error("Crawl job completed but no data was returned");
        }
      }

      const data: CrawlStatusResponse = await response.json();

      if (data.status === "completed") {
        return data;
      }

      if (
        ["active", "paused", "pending", "queued", "scraping"].includes(
          data.status,
        )
      ) {
        checkInterval = Math.max(checkInterval, 2);
        await new Promise((resolve) =>
          setTimeout(resolve, checkInterval * 1000),
        );
      } else {
        throw new Error(
          `Crawl job failed or was stopped. Status: ${data.status}`,
        );
      }
    }
  }
}
