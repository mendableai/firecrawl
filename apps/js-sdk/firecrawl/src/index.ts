import axios, { AxiosResponse, AxiosRequestHeaders } from "axios";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { WebSocket } from "isows";
import { TypedEventTarget } from "typescript-event-target";

/**
 * Configuration interface for FirecrawlApp.
 * @param apiKey - Optional API key for authentication.
 * @param apiUrl - Optional base URL of the API; defaults to 'https://api.firecrawl.dev'.
 */
export interface FirecrawlAppConfig {
  apiKey?: string | null;
  apiUrl?: string | null;
}

/**
 * Metadata for a Firecrawl document.
 * Includes various optional properties for document metadata.
 */
export interface FirecrawlDocumentMetadata {
  title?: string;
  description?: string;
  language?: string;
  keywords?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  ogAudio?: string;
  ogDeterminer?: string;
  ogLocale?: string;
  ogLocaleAlternate?: string[];
  ogSiteName?: string;
  ogVideo?: string;
  dctermsCreated?: string;
  dcDateCreated?: string;
  dcDate?: string;
  dctermsType?: string;
  dcType?: string;
  dctermsAudience?: string;
  dctermsSubject?: string;
  dcSubject?: string;
  dcDescription?: string;
  dctermsKeywords?: string;
  modifiedTime?: string;
  publishedTime?: string;
  articleTag?: string;
  articleSection?: string;
  sourceURL?: string;
  statusCode?: number;
  error?: string;
  [key: string]: any; // Allows for additional metadata properties not explicitly defined.
}

/**
 * Document interface for Firecrawl.
 * Represents a document retrieved or processed by Firecrawl.
 */
export interface FirecrawlDocument {
  url?: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  extract?: Record<any, any>;
  screenshot?: string;
  metadata?: FirecrawlDocumentMetadata;
}

/**
 * Parameters for scraping operations.
 * Defines the options and configurations available for scraping web content.
 */
export interface ScrapeParams {
  formats: ("markdown" | "html" | "rawHtml" | "content" | "links" | "screenshot" | "extract" | "full@scrennshot")[];
  headers?: Record<string, string>;
  includeTags?: string[];
  excludeTags?: string[];
  onlyMainContent?: boolean;
  extract?: {
    prompt?: string;
    schema?: z.ZodSchema | any;
    systemPrompt?: string;
  };
  waitFor?: number;
  timeout?: number;
}

/**
 * Response interface for scraping operations.
 * Defines the structure of the response received after a scraping operation.
 */
export interface ScrapeResponse extends FirecrawlDocument {
  success: true;
  warning?: string;
  error?: string;
}

/**
 * Parameters for crawling operations.
 * Includes options for both scraping and mapping during a crawl.
 */
export interface CrawlParams {
  includePaths?: string[];
  excludePaths?: string[];
  maxDepth?: number;
  limit?: number;
  allowBackwardLinks?: boolean;
  allowExternalLinks?: boolean;
  ignoreSitemap?: boolean;
  scrapeOptions?: ScrapeParams;
  webhook?: string;
}

/**
 * Response interface for crawling operations.
 * Defines the structure of the response received after initiating a crawl.
 */
export interface CrawlResponse {
  id?: string;
  url?: string;
  success: true;
  error?: string;
}

/**
 * Response interface for job status checks.
 * Provides detailed status of a crawl job including progress and results.
 */
export interface CrawlStatusResponse {
  success: true;
  total: number;
  completed: number;
  creditsUsed: number;
  expiresAt: Date;
  status: "scraping" | "completed" | "failed";
  next: string;
  data?: FirecrawlDocument[];
  error?: string;
}

/**
 * Parameters for mapping operations.
 * Defines options for mapping URLs during a crawl.
 */
export interface MapParams {
  search?: string;
  ignoreSitemap?: boolean;
  includeSubdomains?: boolean;
  limit?: number;
}

/**
 * Response interface for mapping operations.
 * Defines the structure of the response received after a mapping operation.
 */
export interface MapResponse {
  success: true;
  links?: string[];
  error?: string;
}

/**
 * Error response interface.
 * Defines the structure of the response received when an error occurs.
 */
export interface ErrorResponse {
  success: false;
  error: string;
}

/**
 * Main class for interacting with the Firecrawl API.
 * Provides methods for scraping, searching, crawling, and mapping web content.
 */
export default class FirecrawlApp {
  public apiKey: string;
  public apiUrl: string;

  /**
   * Initializes a new instance of the FirecrawlApp class.
   * @param config - Configuration options for the FirecrawlApp instance.
   */
  constructor({ apiKey = null, apiUrl = null }: FirecrawlAppConfig) {
    this.apiKey = apiKey || "";
    this.apiUrl = apiUrl || "https://api.firecrawl.dev";
  }

  /**
   * Scrapes a URL using the Firecrawl API.
   * @param url - The URL to scrape.
   * @param params - Additional parameters for the scrape request.
   * @returns The response from the scrape operation.
   */
  async scrapeUrl(
    url: string,
    params?: ScrapeParams
  ): Promise<ScrapeResponse | ErrorResponse> {
    const headers: AxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    } as AxiosRequestHeaders;
    let jsonData: any = { url, ...params };
    if (jsonData?.extract?.schema) {
      let schema = jsonData.extract.schema;

      // Try parsing the schema as a Zod schema
      try {
        schema = zodToJsonSchema(schema);
      } catch (error) {
        
      }
      jsonData = {
        ...jsonData,
        extract: {
          ...jsonData.extract,
          schema: schema,
        },
      };
    }
    try {
      const response: AxiosResponse = await axios.post(
        this.apiUrl + `/v1/scrape`,
        jsonData,
        { headers }
      );
      if (response.status === 200) {
        const responseData = response.data;
        if (responseData.success) {
          return {
            success: true,
            warning: responseData.warning,
            error: responseData.error,
            ...responseData.data
          };
        } else {
          throw new Error(`Failed to scrape URL. Error: ${responseData.error}`);
        }
      } else {
        this.handleError(response, "scrape URL");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
    return { success: false, error: "Internal server error." };
  }

  /**
   * This method is intended to search for a query using the Firecrawl API. However, it is not supported in version 1 of the API.
   * @param query - The search query string.
   * @param params - Additional parameters for the search.
   * @returns Throws an error advising to use version 0 of the API.
   */
  async search(
    query: string,
    params?: any
  ): Promise<any> {
    throw new Error("Search is not supported in v1, please update FirecrawlApp() initialization to use v0.");
  }

  /**
   * Initiates a crawl job for a URL using the Firecrawl API.
   * @param url - The URL to crawl.
   * @param params - Additional parameters for the crawl request.
   * @param pollInterval - Time in seconds for job status checks.
   * @param idempotencyKey - Optional idempotency key for the request.
   * @returns The response from the crawl operation.
   */
  async crawlUrl(
    url: string,
    params?: CrawlParams,
    pollInterval: number = 2,
    idempotencyKey?: string
  ): Promise<CrawlStatusResponse | ErrorResponse> {
    const headers = this.prepareHeaders(idempotencyKey);
    let jsonData: any = { url, ...params };
    try {
      const response: AxiosResponse = await this.postRequest(
        this.apiUrl + `/v1/crawl`,
        jsonData,
        headers
      );
      if (response.status === 200) {
        const id: string = response.data.id;
        return this.monitorJobStatus(id, headers, pollInterval);
      } else {
        this.handleError(response, "start crawl job");
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(`Request failed with status code ${error.response.status}. Error: ${error.response.data.error} ${error.response.data.details ? ` - ${JSON.stringify(error.response.data.details)}` : ''}`);
      } else {
        throw new Error(error.message);
      }
    }
    return { success: false, error: "Internal server error." };
  }

  async asyncCrawlUrl(
    url: string,
    params?: CrawlParams,
    idempotencyKey?: string
  ): Promise<CrawlResponse | ErrorResponse> {
    const headers = this.prepareHeaders(idempotencyKey);
    let jsonData: any = { url, ...params };
    try {
      const response: AxiosResponse = await this.postRequest(
        this.apiUrl + `/v1/crawl`,
        jsonData,
        headers
      );
      if (response.status === 200) {
        return response.data;
      } else {
        this.handleError(response, "start crawl job");
      }
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(`Request failed with status code ${error.response.status}. Error: ${error.response.data.error} ${error.response.data.details ? ` - ${JSON.stringify(error.response.data.details)}` : ''}`);
      } else {
        throw new Error(error.message);
      }
    }
    return { success: false, error: "Internal server error." };
  }

  /**
   * Checks the status of a crawl job using the Firecrawl API.
   * @param id - The ID of the crawl operation.
   * @returns The response containing the job status.
   */
  async checkCrawlStatus(id?: string): Promise<CrawlStatusResponse | ErrorResponse> {
    if (!id) {
      throw new Error("No crawl ID provided");
    }

    const headers: AxiosRequestHeaders = this.prepareHeaders();
    try {
      const response: AxiosResponse = await this.getRequest(
        `${this.apiUrl}/v1/crawl/${id}`,
        headers
      );
      if (response.status === 200) {
        return ({
          success: true,
          status: response.data.status,
          total: response.data.total,
          completed: response.data.completed,
          creditsUsed: response.data.creditsUsed,
          expiresAt: new Date(response.data.expiresAt),
          next: response.data.next,
          data: response.data.data,
          error: response.data.error
        })
      } else {
        this.handleError(response, "check crawl status");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
    return { success: false, error: "Internal server error." };
  }

  async crawlUrlAndWatch(
    url: string,
    params?: CrawlParams,
    idempotencyKey?: string,
  ) {
    const crawl = await this.asyncCrawlUrl(url, params, idempotencyKey);

    if (crawl.success && crawl.id) {
      const id = crawl.id;
      return new CrawlWatcher(id, this);
    }

    throw new Error("Crawl job failed to start");
  }

  async mapUrl(url: string, params?: MapParams): Promise<MapResponse | ErrorResponse> {
    const headers = this.prepareHeaders();
    let jsonData: { url: string } & MapParams = { url, ...params };

    try {
      const response: AxiosResponse = await this.postRequest(
        this.apiUrl + `/v1/map`,
        jsonData,
        headers
      );
      if (response.status === 200) {
        return response.data as MapResponse;
      } else {
        this.handleError(response, "map");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
    return { success: false, error: "Internal server error." };
  }

  /**
   * Prepares the headers for an API request.
   * @param idempotencyKey - Optional key to ensure idempotency.
   * @returns The prepared headers.
   */
  prepareHeaders(idempotencyKey?: string): AxiosRequestHeaders {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    } as AxiosRequestHeaders & { "x-idempotency-key"?: string };
  }

  /**
   * Sends a POST request to the specified URL.
   * @param url - The URL to send the request to.
   * @param data - The data to send in the request.
   * @param headers - The headers for the request.
   * @returns The response from the POST request.
   */
  postRequest(
    url: string,
    data: any,
    headers: AxiosRequestHeaders
  ): Promise<AxiosResponse> {
    return axios.post(url, data, { headers });
  }

  /**
   * Sends a GET request to the specified URL.
   * @param url - The URL to send the request to.
   * @param headers - The headers for the request.
   * @returns The response from the GET request.
   */
  getRequest(
    url: string,
    headers: AxiosRequestHeaders
  ): Promise<AxiosResponse> {
    return axios.get(url, { headers });
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
    headers: AxiosRequestHeaders,
    checkInterval: number
  ): Promise<CrawlStatusResponse> {
    while (true) {
      let statusResponse: AxiosResponse = await this.getRequest(
        `${this.apiUrl}/v1/crawl/${id}`,
        headers
      );
      if (statusResponse.status === 200) {
        let statusData = statusResponse.data;
        if (statusData.status === "completed") {
          if ("data" in statusData) {
            let data = statusData.data;
            while ('next' in statusData) {
              statusResponse = await this.getRequest(statusData.next, headers);
              statusData = statusResponse.data;
              data = data.concat(statusData.data);
            }
            statusData.data = data;
            return statusData;
          } else {
            throw new Error("Crawl job completed but no data was returned");
          }
        } else if (
          ["active", "paused", "pending", "queued", "waiting", "scraping"].includes(statusData.status)
        ) {
          checkInterval = Math.max(checkInterval, 2);
          await new Promise((resolve) =>
            setTimeout(resolve, checkInterval * 1000)
          );
        } else {
          throw new Error(
            `Crawl job failed or was stopped. Status: ${statusData.status}`
          );
        }
      } else {
        this.handleError(statusResponse, "check crawl status");
      }
    }
  }

  /**
   * Handles errors from API responses.
   * @param {AxiosResponse} response - The response from the API.
   * @param {string} action - The action being performed when the error occurred.
   */
  handleError(response: AxiosResponse, action: string): void {
    if ([402, 408, 409, 500].includes(response.status)) {
      const errorMessage: string =
        response.data.error || "Unknown error occurred";
      throw new Error(
        `Failed to ${action}. Status code: ${response.status}. Error: ${errorMessage}`
      );
    } else {
      throw new Error(
        `Unexpected error occurred while trying to ${action}. Status code: ${response.status}`
      );
    }
  }
}

interface CrawlWatcherEvents {
  document: CustomEvent<FirecrawlDocument>,
  done: CustomEvent<{
    status: CrawlStatusResponse["status"];
    data: FirecrawlDocument[];
  }>,
  error: CustomEvent<{
    status: CrawlStatusResponse["status"],
    data: FirecrawlDocument[],
    error: string,
  }>,
}

export class CrawlWatcher extends TypedEventTarget<CrawlWatcherEvents> {
  private ws: WebSocket;
  public data: FirecrawlDocument[];
  public status: CrawlStatusResponse["status"];

  constructor(id: string, app: FirecrawlApp) {
    super();
    this.ws = new WebSocket(`${app.apiUrl}/v1/crawl/${id}`, app.apiKey);
    this.status = "scraping";
    this.data = [];

    type ErrorMessage = {
      type: "error",
      error: string,
    }
    
    type CatchupMessage = {
      type: "catchup",
      data: CrawlStatusResponse,
    }
    
    type DocumentMessage = {
      type: "document",
      data: FirecrawlDocument,
    }
    
    type DoneMessage = { type: "done" }
    
    type Message = ErrorMessage | CatchupMessage | DoneMessage | DocumentMessage;

    const messageHandler = (msg: Message) => {
      if (msg.type === "done") {
        this.status = "completed";
        this.dispatchTypedEvent("done", new CustomEvent("done", {
          detail: {
            status: this.status,
            data: this.data,
          },
        }));
      } else if (msg.type === "error") {
        this.status = "failed";
        this.dispatchTypedEvent("error", new CustomEvent("error", {
          detail: {
            status: this.status,
            data: this.data,
            error: msg.error,
          },
        }));
      } else if (msg.type === "catchup") {
        this.status = msg.data.status;
        this.data.push(...(msg.data.data ?? []));
        for (const doc of this.data) {
          this.dispatchTypedEvent("document", new CustomEvent("document", {
            detail: doc,
          }));
        }
      } else if (msg.type === "document") {
        this.dispatchTypedEvent("document", new CustomEvent("document", {
          detail: msg.data,
        }));
      }
    }

    this.ws.onmessage = ((ev: MessageEvent) => {
      if (typeof ev.data !== "string") {
        this.ws.close();
        return;
      }

      const msg = JSON.parse(ev.data) as Message;
      messageHandler(msg);
    }).bind(this);

    this.ws.onclose = ((ev: CloseEvent) => {
      const msg = JSON.parse(ev.reason) as Message;
      messageHandler(msg);
    }).bind(this);

    this.ws.onerror = ((_: Event) => {
      this.status = "failed"
      this.dispatchTypedEvent("error", new CustomEvent("error", {
        detail: {
          status: this.status,
          data: this.data,
          error: "WebSocket error",
        },
      }));
    }).bind(this);
  }

  close() {
    this.ws.close();
  }
}
