import { AxiosResponse, AxiosRequestHeaders } from 'axios';
/**
 * Configuration interface for FirecrawlApp.
 */
export interface FirecrawlAppConfig {
    apiKey?: string | null;
}
/**
 * Generic parameter interface.
 */
export interface Params {
    [key: string]: any;
}
/**
 * Response interface for scraping operations.
 */
export interface ScrapeResponse {
    success: boolean;
    data?: any;
    error?: string;
}
/**
 * Response interface for searching operations.
 */
export interface SearchResponse {
    success: boolean;
    data?: any;
    error?: string;
}
/**
 * Response interface for crawling operations.
 */
export interface CrawlResponse {
    success: boolean;
    jobId?: string;
    data?: any;
    error?: string;
}
/**
 * Response interface for job status checks.
 */
export interface JobStatusResponse {
    success: boolean;
    status: string;
    jobId?: string;
    data?: any;
    error?: string;
}
/**
 * Main class for interacting with the Firecrawl API.
 */
export default class FirecrawlApp {
    private apiKey;
    /**
     * Initializes a new instance of the FirecrawlApp class.
     * @param {FirecrawlAppConfig} config - Configuration options for the FirecrawlApp instance.
     */
    constructor({ apiKey }: FirecrawlAppConfig);
    /**
     * Scrapes a URL using the Firecrawl API.
     * @param {string} url - The URL to scrape.
     * @param {Params | null} params - Additional parameters for the scrape request.
     * @returns {Promise<ScrapeResponse>} The response from the scrape operation.
     */
    scrapeUrl(url: string, params?: Params | null): Promise<ScrapeResponse>;
    /**
     * Searches for a query using the Firecrawl API.
     * @param {string} query - The query to search for.
     * @param {Params | null} params - Additional parameters for the search request.
     * @returns {Promise<SearchResponse>} The response from the search operation.
     */
    search(query: string, params?: Params | null): Promise<SearchResponse>;
    /**
     * Initiates a crawl job for a URL using the Firecrawl API.
     * @param {string} url - The URL to crawl.
     * @param {Params | null} params - Additional parameters for the crawl request.
     * @param {boolean} waitUntilDone - Whether to wait for the crawl job to complete.
     * @param {number} timeout - Timeout in seconds for job status checks.
     * @returns {Promise<CrawlResponse | any>} The response from the crawl operation.
     */
    crawlUrl(url: string, params?: Params | null, waitUntilDone?: boolean, timeout?: number): Promise<CrawlResponse | any>;
    /**
     * Checks the status of a crawl job using the Firecrawl API.
     * @param {string} jobId - The job ID of the crawl operation.
     * @returns {Promise<JobStatusResponse>} The response containing the job status.
     */
    checkCrawlStatus(jobId: string): Promise<JobStatusResponse>;
    /**
     * Prepares the headers for an API request.
     * @returns {AxiosRequestHeaders} The prepared headers.
     */
    prepareHeaders(): AxiosRequestHeaders;
    /**
     * Sends a POST request to the specified URL.
     * @param {string} url - The URL to send the request to.
     * @param {Params} data - The data to send in the request.
     * @param {AxiosRequestHeaders} headers - The headers for the request.
     * @returns {Promise<AxiosResponse>} The response from the POST request.
     */
    postRequest(url: string, data: Params, headers: AxiosRequestHeaders): Promise<AxiosResponse>;
    /**
     * Sends a GET request to the specified URL.
     * @param {string} url - The URL to send the request to.
     * @param {AxiosRequestHeaders} headers - The headers for the request.
     * @returns {Promise<AxiosResponse>} The response from the GET request.
     */
    getRequest(url: string, headers: AxiosRequestHeaders): Promise<AxiosResponse>;
    /**
     * Monitors the status of a crawl job until completion or failure.
     * @param {string} jobId - The job ID of the crawl operation.
     * @param {AxiosRequestHeaders} headers - The headers for the request.
     * @param {number} timeout - Timeout in seconds for job status checks.
     * @returns {Promise<any>} The final job status or data.
     */
    monitorJobStatus(jobId: string, headers: AxiosRequestHeaders, timeout: number): Promise<any>;
    /**
     * Handles errors from API responses.
     * @param {AxiosResponse} response - The response from the API.
     * @param {string} action - The action being performed when the error occurred.
     */
    handleError(response: AxiosResponse, action: string): void;
}
