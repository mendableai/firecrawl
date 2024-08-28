import axios, { AxiosResponse, AxiosRequestHeaders } from "axios";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Configuration interface for FirecrawlApp.
 * @param apiKey - Optional API key for authentication.
 * @param apiUrl - Optional base URL of the API; defaults to 'https://api.firecrawl.dev'.
 * @param version - API version, either 'v0' or 'v1'.
 */
export interface FirecrawlAppConfig {
  apiKey?: string | null;
  apiUrl?: string | null;
  version?: "v0" | "v1";
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
 * Metadata for a Firecrawl document on v0.
 * Similar to FirecrawlDocumentMetadata but includes properties specific to API version v0.
 */
export interface FirecrawlDocumentMetadataV0 {
  // Similar properties as FirecrawlDocumentMetadata with additional v0 specific adjustments
  pageStatusCode?: number;
  pageError?: string;
  [key: string]: any;
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
  screenshot?: string;
  metadata: FirecrawlDocumentMetadata;
}

/**
 * Document interface for Firecrawl on v0.
 * Represents a document specifically for API version v0 with additional properties.
 */
export interface FirecrawlDocumentV0 {
  id?: string;
  url?: string;
  content: string;
  markdown?: string;
  html?: string;
  llm_extraction?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  type?: string;
  metadata: FirecrawlDocumentMetadataV0;
  childrenLinks?: string[];
  provider?: string;
  warning?: string;
  index?: number;
}

/**
 * Parameters for scraping operations.
 * Defines the options and configurations available for scraping web content.
 */
export interface ScrapeParams {
  formats: ("markdown" | "html" | "rawHtml" | "content" | "links" | "screenshot")[];
  headers?: Record<string, string>;
  includeTags?: string[];
  excludeTags?: string[];
  onlyMainContent?: boolean;
  screenshotMode?: "desktop" | "full-desktop" | "mobile" | "full-mobile";
  waitFor?: number;
  timeout?: number;
}

/**
 * Parameters for scraping operations on v0.
 * Includes page and extractor options specific to API version v0.
 */
export interface ScrapeParamsV0 {
  pageOptions?: {
    headers?: Record<string, string>;
    includeHtml?: boolean;
    includeRawHtml?: boolean;
    onlyIncludeTags?: string[];
    onlyMainContent?: boolean;
    removeTags?: string[];
    replaceAllPathsWithAbsolutePaths?: boolean;
    screenshot?: boolean;
    fullPageScreenshot?: boolean;
    waitFor?: number;
  };
  extractorOptions?: {
    mode?: "markdown" | "llm-extraction" | "llm-extraction-from-raw-html" | "llm-extraction-from-markdown";
    extractionPrompt?: string;
    extractionSchema?: Record<string, any> | z.ZodSchema | any;
  };
  timeout?: number;
}

/**
 * Response interface for scraping operations.
 * Defines the structure of the response received after a scraping operation.
 */
export interface ScrapeResponse extends FirecrawlDocument {
  success: boolean;
  warning?: string;
  error?: string;
}

/**
 * Response interface for scraping operations on v0.
 * Similar to ScrapeResponse but tailored for responses from API version v0.
 */
export interface ScrapeResponseV0 {
  success: boolean;
  data?: FirecrawlDocumentV0;
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
}

/**
 * Parameters for crawling operations on v0.
 * Tailored for API version v0, includes specific options for crawling.
 */
export interface CrawlParamsV0 {
  crawlerOptions?: {
    includes?: string[];
    excludes?: string[];
    generateImgAltText?: boolean;
    returnOnlyUrls?: boolean;
    maxDepth?: number;
    mode?: "default" | "fast";
    ignoreSitemap?: boolean;
    limit?: number;
    allowBackwardCrawling?: boolean;
    allowExternalContentLinks?: boolean;
  };
  pageOptions?: {
    headers?: Record<string, string>;
    includeHtml?: boolean;
    includeRawHtml?: boolean;
    onlyIncludeTags?: string[];
    onlyMainContent?: boolean;
    removeTags?: string[];
    replaceAllPathsWithAbsolutePaths?: boolean;
    screenshot?: boolean;
    fullPageScreenshot?: boolean;
    waitFor?: number;
  };
}

/**
 * Response interface for crawling operations.
 * Defines the structure of the response received after initiating a crawl.
 */
export interface CrawlResponse {
  id?: string;
  url?: string;
  success: boolean;
  error?: string;
}

/**
 * Response interface for crawling operations on v0.
 * Similar to CrawlResponse but tailored for responses from API version v0.
 */
export interface CrawlResponseV0 {
  jobId?: string;
  success: boolean;
  error?: string;
}

/**
 * Response interface for job status checks.
 * Provides detailed status of a crawl job including progress and results.
 */
export interface CrawlStatusResponse {
  success: boolean;
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
 * Response interface for job status checks on v0.
 * Tailored for API version v0, provides status and partial data of a crawl job.
 */
export interface CrawlStatusResponseV0 {
  success: boolean;
  status: string;
  current?: number;
  current_url?: string;
  current_step?: string;
  total?: number;
  data?: FirecrawlDocumentV0[];
  partial_data?: FirecrawlDocumentV0[];
  error?: string;
}


/**
 * Parameters for mapping operations.
 * Defines options for mapping URLs during a crawl.
 */
export interface MapParams {
  includePaths?: string[]
  excludePaths?: string[]
  maxDepth?: number
  limit?: number
  allowBackwardLinks?: boolean
  allowExternalLinks?: boolean
  ignoreSitemap?: boolean
}

/**
 * Response interface for mapping operations.
 * Defines the structure of the response received after a mapping operation.
 */
export interface MapResponse {
  success: boolean;
  links?: string[];
  error?: string;
}

/**
 * Parameters for searching operations on v0.
 * Tailored for API version v0, includes specific options for searching content.
 */
export interface SearchParamsV0 {
  pageOptions?: {
    onlyMainContent?: boolean;
    fetchPageContent?: boolean;
    includeHtml?: boolean;
    includeRawHtml?: boolean;
  };
  searchOptions?: {
    limit?: number;
  };
}

/**
 * Response interface for searching operations on v0.
 * Defines the structure of the response received after a search operation on v0.
 */
export interface SearchResponseV0 {
  success: boolean;
  data?: FirecrawlDocumentV0[];
  error?: string;
}

/**
 * Main class for interacting with the Firecrawl API.
 * Provides methods for scraping, searching, crawling, and mapping web content.
 */
export default class FirecrawlApp<T extends "v0" | "v1"> {
  private apiKey: string;
  private apiUrl: string;
  public version: T;

  /**
   * Initializes a new instance of the FirecrawlApp class.
   * @param config - Configuration options for the FirecrawlApp instance.
   */
  constructor({ apiKey = null, apiUrl = null, version = "v1" }: FirecrawlAppConfig) {
    this.apiKey = apiKey || "";
    this.apiUrl = apiUrl || "https://api.firecrawl.dev";
    this.version = version as T;
    if (!this.apiKey) {
      throw new Error("No API key provided");
    }
  }

  /**
   * Scrapes a URL using the Firecrawl API.
   * @param url - The URL to scrape.
   * @param params - Additional parameters for the scrape request.
   * @returns The response from the scrape operation.
   */
  async scrapeUrl(
    url: string,
    params?: ScrapeParams | ScrapeParamsV0
  ): Promise<this['version'] extends 'v0' ? ScrapeResponseV0 : ScrapeResponse> {
    const headers: AxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    } as AxiosRequestHeaders;
    let jsonData: any = { url, ...params };
    if (jsonData?.extractorOptions?.extractionSchema) {
      let schema = jsonData.extractorOptions.extractionSchema;
      // Check if schema is an instance of ZodSchema to correctly identify Zod schemas
      if (schema instanceof z.ZodSchema) {
        schema = zodToJsonSchema(schema);
      }
      jsonData = {
        ...jsonData,
        extractorOptions: {
          ...jsonData.extractorOptions,
          extractionSchema: schema,
          mode: jsonData.extractorOptions.mode || "llm-extraction",
        },
      };
    }
    try {
      const response: AxiosResponse = await axios.post(
        this.apiUrl + `/${this.version}/scrape`,
        jsonData,
        { headers }
      );
      if (response.status === 200) {
        const responseData = response.data;
        if (responseData.success) {
          return (this.version === 'v0' ? responseData as ScrapeResponseV0 : {
            success: true,
            warning: responseData.warning,
            error: responseData.error,
            ...responseData.data
          }) as ScrapeResponse;
        } else {
          throw new Error(`Failed to scrape URL. Error: ${responseData.error}`);
        }
      } else {
        this.handleError(response, "scrape URL");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
    return { success: false, error: "Internal server error." } as this['version'] extends 'v0' ? ScrapeResponseV0 : ScrapeResponse;
  }

  /**
   * Searches for a query using the Firecrawl API.
   * @param query - The query to search for.
   * @param params - Additional parameters for the search request.
   * @returns The response from the search operation.
   */
  async search(
    query: string,
    params?: SearchParamsV0
  ): Promise<SearchResponseV0> {
    if (this.version === "v1") {
      throw new Error("Search is not supported in v1, please update FirecrawlApp() initialization to use v0.");
    }

    const headers: AxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    } as AxiosRequestHeaders;
    let jsonData: any = { query };
    if (params) {
      jsonData = { ...jsonData, ...params };
    }
    try {
      const response: AxiosResponse = await axios.post(
        this.apiUrl + "/v0/search",
        jsonData,
        { headers }
      );
      if (response.status === 200) {
        const responseData = response.data;
        if (responseData.success) {
          return responseData;
        } else {
          throw new Error(`Failed to search. Error: ${responseData.error}`);
        }
      } else {
        this.handleError(response, "search");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
    return { success: false, error: "Internal server error." };
  }

  /**
   * Initiates a crawl job for a URL using the Firecrawl API.
   * @param url - The URL to crawl.
   * @param params - Additional parameters for the crawl request.
   * @param waitUntilDone - Whether to wait for the crawl job to complete.
   * @param pollInterval - Time in seconds for job status checks.
   * @param idempotencyKey - Optional idempotency key for the request.
   * @returns The response from the crawl operation.
   */
  async crawlUrl(
    url: string,
    params?: this['version'] extends 'v0' ? CrawlParamsV0 : CrawlParams,
    waitUntilDone: boolean = true,
    pollInterval: number = 2,
    idempotencyKey?: string
  ): Promise<
    this['version'] extends 'v0'
      ? CrawlResponseV0 | CrawlStatusResponseV0 | FirecrawlDocumentV0[]
      : CrawlResponse | CrawlStatusResponse
  > {
    const headers = this.prepareHeaders(idempotencyKey);
    let jsonData: any = { url, ...params };
    try {
      const response: AxiosResponse = await this.postRequest(
        this.apiUrl + `/${this.version}/crawl`,
        jsonData,
        headers
      );
      if (response.status === 200) {
        const id: string = this.version === 'v0' ? response.data.jobId : response.data.id;
        let checkUrl: string | undefined = undefined;
        if (waitUntilDone) {
          if (this.version === 'v1') { checkUrl = response.data.url }
          return this.monitorJobStatus(id, headers, pollInterval, checkUrl);
        } else {
          if (this.version === 'v0') {
            return {
              success: true,
              jobId: id
            } as CrawlResponseV0;
          } else {
            return {
              success: true,
              id: id
            } as CrawlResponse;
          }
        }
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
    return { success: false, error: "Internal server error." } as this['version'] extends 'v0' ? CrawlResponseV0 : CrawlResponse;
  }

  /**
   * Checks the status of a crawl job using the Firecrawl API.
   * @param id - The ID of the crawl operation.
   * @returns The response containing the job status.
   */
  async checkCrawlStatus(id?: string): Promise<this['version'] extends 'v0' ? CrawlStatusResponseV0 : CrawlStatusResponse> {
    if (!id) {
      throw new Error("No crawl ID provided");
    }

    const headers: AxiosRequestHeaders = this.prepareHeaders();
    try {
      const response: AxiosResponse = await this.getRequest(
        this.version === 'v1' ?
          `${this.apiUrl}/${this.version}/crawl/${id}` :
          `${this.apiUrl}/${this.version}/crawl/status/${id}`,
        headers
      );
      if (response.status === 200) {
        if (this.version === 'v0') {
          return ({
            success: true,
            status: response.data.status,
            current: response.data.current,
            current_url: response.data.current_url,
            current_step: response.data.current_step,
            total: response.data.total,
            data: response.data.data,
            partial_data: !response.data.data
              ? response.data.partial_data
              : undefined,
          } as CrawlStatusResponseV0) as this['version'] extends 'v0' ? CrawlStatusResponseV0 : CrawlStatusResponse;
        } else {
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
          } as CrawlStatusResponse) as this['version'] extends 'v0' ? CrawlStatusResponseV0 : CrawlStatusResponse;
        }
      } else {
        this.handleError(response, "check crawl status");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }

    return this.version === 'v0' ?
      ({
        success: false,
        status: "unknown",
        current: 0,
        current_url: "",
        current_step: "",
        total: 0,
        error: "Internal server error.",
      } as this['version'] extends 'v0' ? CrawlStatusResponseV0 : CrawlStatusResponse) :
      ({
        success: false,
        error: "Internal server error.",
      } as this['version'] extends 'v0' ? CrawlStatusResponseV0 : CrawlStatusResponse);
  }

  async mapUrl(url: string, params?: MapParams): Promise<MapResponse> {
    if (this.version == 'v0') {
      throw new Error("Map is not supported in v0");
    }
    const headers = this.prepareHeaders();
    let jsonData: { url: string } & MapParams = { url, ...params };

    try {
      const response: AxiosResponse = await this.postRequest(
        this.apiUrl + `/${this.version}/map`,
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
    return { success: false, error: "Internal server error." } as MapResponse;
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
    checkInterval: number,
    checkUrl?: string
  ): Promise<this['version'] extends 'v0' ? CrawlStatusResponseV0 | FirecrawlDocumentV0[] : CrawlStatusResponse> {
    let apiUrl: string = '';
    while (true) {
      if (this.version === 'v1') {
        apiUrl = checkUrl ?? `${this.apiUrl}/v1/crawl/${id}`;
      } else if (this.version === 'v0') {
        apiUrl = `${this.apiUrl}/v0/crawl/status/${id}`;
      }
      const statusResponse: AxiosResponse = await this.getRequest(
        apiUrl,
        headers
      );
      if (statusResponse.status === 200) {
        const statusData = statusResponse.data;
        if (statusData.status === "completed") {
          if ("data" in statusData) {
            return this.version === 'v0' ? statusData.data : statusData;
          } else {
            throw new Error("Crawl job completed but no data was returned");
          }
        } else if (
          ["active", "paused", "pending", "queued", "scraping"].includes(statusData.status)
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
