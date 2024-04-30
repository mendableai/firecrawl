import { ExtractorOptions } from "./lib/entities";

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
  num_tokens?: number
}

export enum RateLimiterMode {
  Crawl = "crawl",
  CrawlStatus = "crawl-status",
  Scrape = "scrape",
  Preview = "preview",
  Search = "search",

}

export interface AuthResponse {
  success: boolean;
  team_id?: string;
  error?: string;
  status?: number;
}


