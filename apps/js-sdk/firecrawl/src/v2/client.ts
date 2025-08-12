import { HttpClient } from "./utils/httpClient";
import { scrape } from "./methods/scrape";
import { search } from "./methods/search";
import { map as mapMethod } from "./methods/map";
import {
  startCrawl,
  getCrawlStatus,
  cancelCrawl,
  crawl as crawlWaiter,
  getCrawlErrors,
  getActiveCrawls,
  crawlParamsPreview,
} from "./methods/crawl";
import {
  startBatchScrape,
  getBatchScrapeStatus,
  getBatchScrapeErrors,
  cancelBatchScrape,
  batchScrape as batchWaiter,
} from "./methods/batch";
import { startExtract, getExtractStatus, extract as extractWaiter } from "./methods/extract";
import { getConcurrency, getCreditUsage, getTokenUsage } from "./methods/usage";
import type {
  Document,
  ScrapeOptions,
  SearchData,
  SearchRequest,
  MapData,
  MapOptions,
  CrawlResponse,
  CrawlJob,
  CrawlErrorsResponse,
  ActiveCrawlsResponse,
  BatchScrapeResponse,
  BatchScrapeJob,
  ExtractResponse,
} from "./types";
import { Watcher } from "./watcher";
import type { WatcherOptions } from "./watcher";

export interface FirecrawlClientOptions {
  apiKey?: string | null;
  apiUrl?: string | null;
  timeoutMs?: number;
  maxRetries?: number;
  backoffFactor?: number;
}

export class FirecrawlClient {
  private readonly http: HttpClient;

  constructor(options: FirecrawlClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.FIRECRAWL_API_KEY ?? "";
    const apiUrl = (options.apiUrl ?? process.env.FIRECRAWL_API_URL ?? "https://api.firecrawl.dev").replace(/\/$/, "");
    if (!apiKey) {
      throw new Error("API key is required. Set FIRECRAWL_API_KEY env or pass apiKey.");
    }
    this.http = new HttpClient({
      apiKey,
      apiUrl,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      backoffFactor: options.backoffFactor,
    });
  }

  // Scrape
  async scrape(url: string, options?: ScrapeOptions): Promise<Document> {
    return scrape(this.http, url, options);
  }

  // Search
  async search(query: string, req: Omit<SearchRequest, "query"> = {}): Promise<SearchData> {
    return search(this.http, { query, ...req });
  }

  // Map
  async map(url: string, options?: MapOptions): Promise<MapData> {
    return mapMethod(this.http, url, options);
  }

  // Crawl
  async startCrawl(url: string, req: Omit<Parameters<typeof startCrawl>[1], "url"> = {}): Promise<CrawlResponse> {
    return startCrawl(this.http, { url, ...(req as any) });
  }
  async getCrawlStatus(jobId: string): Promise<CrawlJob> {
    return getCrawlStatus(this.http, jobId);
  }
  async cancelCrawl(jobId: string): Promise<boolean> {
    return cancelCrawl(this.http, jobId);
  }
  async crawl(url: string, req: Omit<Parameters<typeof startCrawl>[1], "url"> & { pollInterval?: number; timeout?: number } = {}): Promise<CrawlJob> {
    return crawlWaiter(this.http, { url, ...(req as any) }, req.pollInterval, req.timeout);
  }
  async getCrawlErrors(crawlId: string): Promise<CrawlErrorsResponse> {
    return getCrawlErrors(this.http, crawlId);
  }
  async getActiveCrawls(): Promise<ActiveCrawlsResponse> {
    return getActiveCrawls(this.http);
  }
  async crawlParamsPreview(url: string, prompt: string): Promise<Record<string, unknown>> {
    return crawlParamsPreview(this.http, url, prompt);
  }

  // Batch
  async startBatchScrape(urls: string[], opts?: Parameters<typeof startBatchScrape>[2]): Promise<BatchScrapeResponse> {
    return startBatchScrape(this.http, urls, opts);
  }
  async getBatchScrapeStatus(jobId: string): Promise<BatchScrapeJob> {
    return getBatchScrapeStatus(this.http, jobId);
  }
  async getBatchScrapeErrors(jobId: string): Promise<CrawlErrorsResponse> {
    return getBatchScrapeErrors(this.http, jobId);
  }
  async cancelBatchScrape(jobId: string): Promise<boolean> {
    return cancelBatchScrape(this.http, jobId);
  }
  async batchScrape(urls: string[], opts?: Parameters<typeof startBatchScrape>[2] & { pollInterval?: number; timeout?: number }): Promise<BatchScrapeJob> {
    return batchWaiter(this.http, urls, opts);
  }

  // Extract
  async startExtract(args: Parameters<typeof startExtract>[1]): Promise<ExtractResponse> {
    return startExtract(this.http, args);
  }
  async getExtractStatus(jobId: string): Promise<ExtractResponse> {
    return getExtractStatus(this.http, jobId);
  }
  async extract(args: Parameters<typeof startExtract>[1] & { pollInterval?: number; timeout?: number }): Promise<ExtractResponse> {
    return extractWaiter(this.http, args);
  }

  // Usage
  async getConcurrency() {
    return getConcurrency(this.http);
  }
  async getCreditUsage() {
    return getCreditUsage(this.http);
  }
  async getTokenUsage() {
    return getTokenUsage(this.http);
  }

  // Watcher
  watcher(jobId: string, opts: WatcherOptions = {}): Watcher {
    return new Watcher(this.http, jobId, opts);
  }
}

export default FirecrawlClient;

