import { ExtractorOptions, Document } from "./lib/entities";

export interface CrawlResult {
  source: string;
  content: string;
  options?: {
    summarize?: boolean;
    summarize_max_chars?: number;
  };
  metadata?: any;
  raw_context_id?: number | string;
  permissions?: any[];
}

export interface IngestResult {
  success: boolean;
  error: string;
  data: CrawlResult[];
}

export interface WebScraperOptions {
  url: string;
  mode: "crawl" | "single_urls" | "sitemap";
  crawlerOptions: any;
  pageOptions: any;
  team_id: string;
  origin?: string;
}

export interface FirecrawlJob {
  success: boolean;
  message: string;
  num_docs: number;
  docs: any[];
  time_taken: number;
  team_id: string;
  mode: string;
  url: string;
  crawlerOptions?: any;
  pageOptions?: any;
  origin: string;
  extractor_options?: ExtractorOptions,
  num_tokens?: number,
}

export interface FirecrawlScrapeResponse {
  statusCode: number;
  body: {
    status: string;
    data: Document;
  };
  error?: string;
}

export interface FirecrawlCrawlResponse {
  statusCode: number;
  body: {
    status: string;
    jobId: string;
    
  };
  error?: string;
}

export interface FirecrawlCrawlStatusResponse {
  statusCode: number;
  body: {
    status: string;
    data: Document[];    
  };
  error?: string;
}

export enum RateLimiterMode {
  Crawl = "crawl",
  CrawlStatus = "crawlStatus",
  Scrape = "scrape",
  Preview = "preview",
  Search = "search",

}

export interface AuthResponse {
  success: boolean;
  team_id?: string;
  error?: string;
  status?: number;
  plan?: string;
}
  

export enum NotificationType {
  APPROACHING_LIMIT = "approachingLimit",
  LIMIT_REACHED = "limitReached",
  RATE_LIMIT_REACHED = "rateLimitReached",
}