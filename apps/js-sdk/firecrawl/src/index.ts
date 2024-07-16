import axios, { AxiosResponse, AxiosRequestHeaders } from "axios";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
/**
 * Configuration interface for FirecrawlApp.
 */
export interface FirecrawlAppConfig {
  apiKey?: string | null;
  apiUrl?: string | null;
}

/**
 * Metadata for a Firecrawl document.
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
  pageStatusCode?: number;
  pageError?: string;
  [key: string]: any;
}

/**
 * Document interface for Firecrawl.
 */
export interface FirecrawlDocument {
  id?: string;
  url?: string;
  content: string;
  markdown?: string;
  html?: string;
  llm_extraction?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  type?: string;
  metadata: FirecrawlDocumentMetadata;
  childrenLinks?: string[];
  provider?: string;
  warning?: string;

  index?: number;
}

/**
 * Response interface for scraping operations.
 */
export interface ScrapeResponse {
  success: boolean;
  data?: FirecrawlDocument;
  error?: string;
}
/**
 * Response interface for searching operations.
 */
export interface SearchResponse {
  success: boolean;
  data?: FirecrawlDocument[];
  error?: string;
}
/**
 * Response interface for crawling operations.
 */
export interface CrawlResponse {
  success: boolean;
  jobId?: string;
  data?: FirecrawlDocument[];
  error?: string;
}
/**
 * Response interface for job status checks.
 */
export interface JobStatusResponse {
  success: boolean;
  status: string;
  current?: number;
  current_url?: string;
  current_step?: string;
  total?: number;
  jobId?: string;
  data?: FirecrawlDocument[];
  partial_data?: FirecrawlDocument[];
  error?: string;
}
/**
 * Generic parameter interface.
 */
export interface Params {
  [key: string]: any;
  extractorOptions?: {
    extractionSchema: z.ZodSchema | any;
    mode?: "llm-extraction";
    extractionPrompt?: string;
  };
}
/**
 * Main class for interacting with the Firecrawl API.
 */
export default class FirecrawlApp {
  private apiKey: string;
  private apiUrl: string;

  /**
   * Initializes a new instance of the FirecrawlApp class.
   * @param {FirecrawlAppConfig} config - Configuration options for the FirecrawlApp instance.
   */
  constructor({ apiKey = null, apiUrl = null }: FirecrawlAppConfig) {
    this.apiKey = apiKey || "";
    this.apiUrl = apiUrl || "https://api.firecrawl.dev";
    if (!this.apiKey) {
      throw new Error("No API key provided");
    }
  }

  /**
   * Scrapes a URL using the Firecrawl API.
   * @param {string} url - The URL to scrape.
   * @param {Params | null} params - Additional parameters for the scrape request.
   * @returns {Promise<ScrapeResponse>} The response from the scrape operation.
   */
  async scrapeUrl(
    url: string,
    params: Params | null = null
  ): Promise<ScrapeResponse> {
    const headers: AxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    } as AxiosRequestHeaders;
    let jsonData: Params = { url, ...params };
    if (params?.extractorOptions?.extractionSchema) {
      let schema = params.extractorOptions.extractionSchema;
      // Check if schema is an instance of ZodSchema to correctly identify Zod schemas
      if (schema instanceof z.ZodSchema) {
        schema = zodToJsonSchema(schema);
      }
      jsonData = {
        ...jsonData,
        extractorOptions: {
          ...params.extractorOptions,
          extractionSchema: schema,
          mode: params.extractorOptions.mode || "llm-extraction",
        },
      };
    }
    try {
      const response: AxiosResponse = await axios.post(
        this.apiUrl + "/v0/scrape",
        jsonData,
        { headers }
      );
      if (response.status === 200) {
        const responseData = response.data;
        if (responseData.success) {
          return responseData;
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
   * Searches for a query using the Firecrawl API.
   * @param {string} query - The query to search for.
   * @param {Params | null} params - Additional parameters for the search request.
   * @returns {Promise<SearchResponse>} The response from the search operation.
   */
  async search(
    query: string,
    params: Params | null = null
  ): Promise<SearchResponse> {
    const headers: AxiosRequestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    } as AxiosRequestHeaders;
    let jsonData: Params = { query };
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
   * @param {string} url - The URL to crawl.
   * @param {Params | null} params - Additional parameters for the crawl request.
   * @param {boolean} waitUntilDone - Whether to wait for the crawl job to complete.
   * @param {number} pollInterval - Time in seconds for job status checks.
   * @param {string} idempotencyKey - Optional idempotency key for the request.
   * @returns {Promise<CrawlResponse | any>} The response from the crawl operation.
   */
  async crawlUrl(
    url: string,
    params: Params | null = null,
    waitUntilDone: boolean = true,
    pollInterval: number = 2,
    idempotencyKey?: string
  ): Promise<CrawlResponse | any> {
    const headers = this.prepareHeaders(idempotencyKey);
    let jsonData: Params = { url };
    if (params) {
      jsonData = { ...jsonData, ...params };
    }
    try {
      const response: AxiosResponse = await this.postRequest(
        this.apiUrl + "/v0/crawl",
        jsonData,
        headers
      );
      if (response.status === 200) {
        const jobId: string = response.data.jobId;
        if (waitUntilDone) {
          return this.monitorJobStatus(jobId, headers, pollInterval);
        } else {
          return { success: true, jobId };
        }
      } else {
        this.handleError(response, "start crawl job");
      }
    } catch (error: any) {
      console.log(error);
      throw new Error(error.message);
    }
    return { success: false, error: "Internal server error." };
  }

  /**
   * Checks the status of a crawl job using the Firecrawl API.
   * @param {string} jobId - The job ID of the crawl operation.
   * @returns {Promise<JobStatusResponse>} The response containing the job status.
   */
  async checkCrawlStatus(jobId: string): Promise<JobStatusResponse> {
    const headers: AxiosRequestHeaders = this.prepareHeaders();
    try {
      const response: AxiosResponse = await this.getRequest(
        this.apiUrl + `/v0/crawl/status/${jobId}`,
        headers
      );
      if (response.status === 200) {
        return {
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
        };
      } else {
        this.handleError(response, "check crawl status");
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
    return {
      success: false,
      status: "unknown",
      current: 0,
      current_url: "",
      current_step: "",
      total: 0,
      error: "Internal server error.",
    };
  }

  /**
   * Prepares the headers for an API request.
   * @returns {AxiosRequestHeaders} The prepared headers.
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
   * @param {string} url - The URL to send the request to.
   * @param {Params} data - The data to send in the request.
   * @param {AxiosRequestHeaders} headers - The headers for the request.
   * @returns {Promise<AxiosResponse>} The response from the POST request.
   */
  postRequest(
    url: string,
    data: Params,
    headers: AxiosRequestHeaders
  ): Promise<AxiosResponse> {
    return axios.post(url, data, { headers });
  }

  /**
   * Sends a GET request to the specified URL.
   * @param {string} url - The URL to send the request to.
   * @param {AxiosRequestHeaders} headers - The headers for the request.
   * @returns {Promise<AxiosResponse>} The response from the GET request.
   */
  getRequest(
    url: string,
    headers: AxiosRequestHeaders
  ): Promise<AxiosResponse> {
    return axios.get(url, { headers });
  }

  /**
   * Monitors the status of a crawl job until completion or failure.
   * @param {string} jobId - The job ID of the crawl operation.
   * @param {AxiosRequestHeaders} headers - The headers for the request.
   * @param {number} timeout - Timeout in seconds for job status checks.
   * @returns {Promise<any>} The final job status or data.
   */
  async monitorJobStatus(
    jobId: string,
    headers: AxiosRequestHeaders,
    checkInterval: number
  ): Promise<any> {
    while (true) {
      const statusResponse: AxiosResponse = await this.getRequest(
        this.apiUrl + `/v0/crawl/status/${jobId}`,
        headers
      );
      if (statusResponse.status === 200) {
        const statusData = statusResponse.data;
        if (statusData.status === "completed") {
          if ("data" in statusData) {
            return statusData.data;
          } else {
            throw new Error("Crawl job completed but no data was returned");
          }
        } else if (
          ["active", "paused", "pending", "queued"].includes(statusData.status)
        ) {
          if (checkInterval < 2) {
            checkInterval = 2;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, checkInterval * 1000)
          ); // Wait for the specified timeout before checking again
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
