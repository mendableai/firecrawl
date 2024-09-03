import { ExtractorOptions, Document, DocumentUrl } from "./lib/entities";

type Mode = "crawl" | "single_urls" | "sitemap";

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
  mode: Mode;
  crawlerOptions: any;
  pageOptions: any;
  extractorOptions?: any;
  team_id: string;
  origin?: string;
  crawl_id?: string;
  sitemapped?: boolean;
  webhook?: string;
  v1?: boolean;
  is_scrape?: boolean;
}

export interface RunWebScraperParams {
  url: string;
  mode: Mode;
  crawlerOptions: any;
  pageOptions?: any;
  extractorOptions?: any;
  inProgress: (progress: any) => void;
  onSuccess: (result: any, mode: string) => void;
  onError: (error: Error) => void;
  team_id: string;
  bull_job_id: string;
  priority?: number;
  is_scrape?: boolean;
}

export interface RunWebScraperResult {
  success: boolean;
  message: string;
  docs: Document[] | DocumentUrl[];
}

export interface FirecrawlJob {
  job_id?: string;
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
  retry?: boolean,
  crawl_id?: string;
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
  Map = "map",

}

export interface AuthResponse {
  success: boolean;
  team_id?: string;
  error?: string;
  status?: number;
  api_key?: string;
  plan?: PlanType;
}
  

export enum NotificationType {
  APPROACHING_LIMIT = "approachingLimit",
  LIMIT_REACHED = "limitReached",
  RATE_LIMIT_REACHED = "rateLimitReached",
}

export type ScrapeLog = {
  url: string;
  scraper: string;
  success?: boolean;
  response_code?: number;
  time_taken_seconds?: number;
  proxy?: string;
  retried?: boolean;
  error_message?: string;
  date_added?: string; // ISO 8601 format
  html?: string;
  ipv4_support?: boolean | null;
  ipv6_support?: boolean | null;
};

export type PlanType = 
  | "starter"
  | "standard"
  | "scale"
  | "hobby"
  | "standardnew"
  | "growth"
  | "growthdouble"
  | "free"
  | "";


export type WebhookEventType = "crawl.page" | "crawl.started" | "crawl.completed" | "crawl.failed";