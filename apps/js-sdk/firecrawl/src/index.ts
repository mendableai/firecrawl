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

type JsonSchema = ReturnType<typeof zodToJsonSchema>;

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
    schema?: z.ZodTypeAny | JsonSchema
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


function isZodSchema(schema: unknown): schema is z.ZodType {
  return schema instanceof z.ZodType;
}

function getFetch(): typeof fetch {
  /**
   * Browser or Node 18+
   */
  try {
    if (typeof globalThis !== "undefined" && "fetch" in globalThis) {
      return fetch.bind(globalThis);
    }
  } catch (err) {
    
  }

  /**
   * Existing polyfilled fetch
   */
  if (typeof fetch !== "undefined") {
    return fetch;
  }

  /**
   * Environments where fetch cannot be found and must be polyfilled
   */
  return require("cross-fetch") as typeof fetch;
}

/**
 * Error class for Firecrawl API errors.
 * 
 * @example
 * ```ts
 * try {
 *   const response = await firecrawl.scrapeUrl("https://example.com");
 * } catch (error) {
 *   if (error instanceof FirecrawlApiError) {
 *     console.error("Firecrawl API error:", error.message);
 *     console.error("Request:", error.request);
 *     console.error("Response:", error.response);
 *   }
 * ```
 */
export class FirecrawlApiError extends Error {
  public request: Request;
  public response: Response;

  constructor(message: string, request: Request, response: Response) {
    super(message);
    this.request = request;
    this.response = response;
  }
}

/**
 * Main class for interacting with the Firecrawl API.
 * Provides methods for scraping, searching, crawling, and mapping web content.
 */
export default class FirecrawlApp {
  public apiKey: string;
  public apiUrl: string;
  private fetch: typeof fetch;

  /**
   * Initializes a new instance of the FirecrawlApp class.
   * @param config - Configuration options for the FirecrawlApp instance.
   */
  constructor({ apiKey = null, apiUrl = null }: FirecrawlAppConfig) {
    this.apiKey = apiKey || "";
    this.apiUrl = apiUrl || "https://api.firecrawl.dev";
    this.fetch = getFetch();
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
  ): Promise<ScrapeResponse> {
    let body = { url, ...params };

    let schema = body.extract?.schema

    if (schema && isZodSchema(schema)) {
      schema = zodToJsonSchema(schema);

      body = {
        ...body,
        extract: {
          ...body.extract,
          schema: schema,
        }
      }
    }

    const request = new Request(this.apiUrl + `/v1/scrape`, {
      method: "POST",
      headers: this.composeHeaders(),
      body: JSON.stringify(body),
    })

    // `fetch` will throw any network related errors
    // We don't need to worry about them since users can handle network errors themselves
    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(`Failed to scrape URL. Error: ${response.statusText}`, request, response);
    }

    const data: { success: true, warning?: string, error?: string, data?: FirecrawlDocument } | { success: false, error: string }  = await response.json()

    if (!data.success) {
      throw new FirecrawlApiError(`Failed to scrape URL. Error: ${data.error}`, request, response);
    }

    return {
      success: true,
      warning: data.warning,
      ...data.data,
    }
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
   * @param pollInterval - Time in seconds for job status checks. Minimum 2 seconds.
   * @param idempotencyKey - Optional idempotency key for the request.
   * @returns The response from the crawl operation.
   */
  async crawlUrl(
    url: string,
    params?: CrawlParams,
    pollInterval: number = 2,
    idempotencyKey?: string
  ): Promise<CrawlStatusResponse> {
    const request = new Request(this.apiUrl + `/v1/crawl`, {
      method: "POST",
      headers: this.composeHeaders(idempotencyKey),
      body: JSON.stringify({ url, ...params }),
    })

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(`Failed to crawl URL. Error: ${response.statusText}`, request, response);
    }

    const data: { id: string } = await response.json();

    return this.monitorJobStatus(data.id, pollInterval, idempotencyKey);
  }

  async asyncCrawlUrl(
    url: string,
    params?: CrawlParams,
    idempotencyKey?: string
  ): Promise<CrawlResponse> {
    // TODO: use `crawlUrl`
    const request = new Request(this.apiUrl + `/v1/crawl`, {
      method: "POST",
      headers: this.composeHeaders(idempotencyKey),
      body: JSON.stringify({ url, ...params }),
    })

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(`Failed to crawl URL. Error: ${response.statusText}`, request, response);
    }

    return response.json();
  }

  /**
   * Checks the status of a crawl job using the Firecrawl API.
   * @param id - The ID of the crawl operation.
   * @returns The response containing the job status.
   */
  async checkCrawlStatus(id: string): Promise<CrawlStatusResponse> {
    const request = new Request(this.apiUrl + `/v1/crawl/${id}`, {
      method: "GET",
      headers: this.composeHeaders(),
    })

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(`Failed to check crawl status. Error: ${response.statusText}`, request, response);
    }

    const data: CrawlStatusResponse = await response.json();

    return {
      success: true,
      status: data.status,
      total: data.total,
      completed: data.completed,
      creditsUsed: data.creditsUsed,
      expiresAt: new Date(data.expiresAt),
      next: data.next,
      data: data.data,
      error: data.error,
    }
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
    })

    const response = await this.fetch(request);

    if (!response.ok) {
      throw new FirecrawlApiError(`Failed to map URL. Error: ${response.statusText}`, request, response);
    }

    return response.json()
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
    }
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
    idempotencyKey?: string
  ): Promise<CrawlStatusResponse> {
    while (true) {
      const request = new Request(this.apiUrl + `/v1/crawl/${id}`, {
        method: "GET",
        headers: this.composeHeaders(idempotencyKey),
      })

      const response = await this.fetch(request);

      if (!response.ok) {
        throw new FirecrawlApiError(`Failed to monitor crawl status. Error: ${response.statusText}`, request, response);
      }

      const data: CrawlStatusResponse = await response.json();

      if (data.status === "completed") {
        return data;
      }

      if (["active", "paused", "pending", "queued", "scraping"].includes(data.status)) {
        checkInterval = Math.max(checkInterval, 2);
        await new Promise((resolve) => setTimeout(resolve, checkInterval * 1000));
      } else {
        throw new Error(`Crawl job failed or was stopped. Status: ${data.status}`);
      }
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
