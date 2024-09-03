import { AxiosResponse, AxiosRequestHeaders } from "axios";
import { z } from "zod";
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
    apiKey: string;
    apiUrl: string;
    /**
     * Initializes a new instance of the FirecrawlApp class.
     * @param config - Configuration options for the FirecrawlApp instance.
     */
    constructor({ apiKey, apiUrl }: FirecrawlAppConfig);
    /**
     * Scrapes a URL using the Firecrawl API.
     * @param url - The URL to scrape.
     * @param params - Additional parameters for the scrape request.
     * @returns The response from the scrape operation.
     */
    scrapeUrl(url: string, params?: ScrapeParams): Promise<ScrapeResponse | ErrorResponse>;
    /**
     * This method is intended to search for a query using the Firecrawl API. However, it is not supported in version 1 of the API.
     * @param query - The search query string.
     * @param params - Additional parameters for the search.
     * @returns Throws an error advising to use version 0 of the API.
     */
    search(query: string, params?: any): Promise<any>;
    /**
     * Initiates a crawl job for a URL using the Firecrawl API.
     * @param url - The URL to crawl.
     * @param params - Additional parameters for the crawl request.
     * @param pollInterval - Time in seconds for job status checks.
     * @param idempotencyKey - Optional idempotency key for the request.
     * @returns The response from the crawl operation.
     */
    crawlUrl(url: string, params?: CrawlParams, pollInterval?: number, idempotencyKey?: string): Promise<CrawlStatusResponse | ErrorResponse>;
    asyncCrawlUrl(url: string, params?: CrawlParams, idempotencyKey?: string): Promise<CrawlResponse | ErrorResponse>;
    /**
     * Checks the status of a crawl job using the Firecrawl API.
     * @param id - The ID of the crawl operation.
     * @returns The response containing the job status.
     */
    checkCrawlStatus(id?: string): Promise<CrawlStatusResponse | ErrorResponse>;
    crawlUrlAndWatch(url: string, params?: CrawlParams, idempotencyKey?: string): Promise<CrawlWatcher>;
    mapUrl(url: string, params?: MapParams): Promise<MapResponse | ErrorResponse>;
    /**
     * Prepares the headers for an API request.
     * @param idempotencyKey - Optional key to ensure idempotency.
     * @returns The prepared headers.
     */
    prepareHeaders(idempotencyKey?: string): AxiosRequestHeaders;
    /**
     * Sends a POST request to the specified URL.
     * @param url - The URL to send the request to.
     * @param data - The data to send in the request.
     * @param headers - The headers for the request.
     * @returns The response from the POST request.
     */
    postRequest(url: string, data: any, headers: AxiosRequestHeaders): Promise<AxiosResponse>;
    /**
     * Sends a GET request to the specified URL.
     * @param url - The URL to send the request to.
     * @param headers - The headers for the request.
     * @returns The response from the GET request.
     */
    getRequest(url: string, headers: AxiosRequestHeaders): Promise<AxiosResponse>;
    /**
     * Monitors the status of a crawl job until completion or failure.
     * @param id - The ID of the crawl operation.
     * @param headers - The headers for the request.
     * @param checkInterval - Interval in seconds for job status checks.
     * @param checkUrl - Optional URL to check the status (used for v1 API)
     * @returns The final job status or data.
     */
    monitorJobStatus(id: string, headers: AxiosRequestHeaders, checkInterval: number): Promise<CrawlStatusResponse>;
    /**
     * Handles errors from API responses.
     * @param {AxiosResponse} response - The response from the API.
     * @param {string} action - The action being performed when the error occurred.
     */
    handleError(response: AxiosResponse, action: string): void;
}
interface CrawlWatcherEvents {
    document: CustomEvent<FirecrawlDocument>;
    done: CustomEvent<{
        status: CrawlStatusResponse["status"];
        data: FirecrawlDocument[];
    }>;
    error: CustomEvent<{
        status: CrawlStatusResponse["status"];
        data: FirecrawlDocument[];
        error: string;
    }>;
}
export declare class CrawlWatcher extends TypedEventTarget<CrawlWatcherEvents> {
    private ws;
    data: FirecrawlDocument[];
    status: CrawlStatusResponse["status"];
    constructor(id: string, app: FirecrawlApp);
    close(): void;
}
export {};
