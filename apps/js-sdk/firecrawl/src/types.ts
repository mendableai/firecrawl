import type { ZodSchema } from "zod";
import type { zodToJsonSchema} from "zod-to-json-schema";

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
    schema?: ZodSchema | JsonSchema
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
  status: "scraping" | "completed" | "failed" | "cancelled";
  completed: number;
  total: number;
  creditsUsed: number;
  expiresAt: Date;
  next?: string;
  data: FirecrawlDocument[];
};

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