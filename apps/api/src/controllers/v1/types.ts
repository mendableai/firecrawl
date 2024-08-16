import { Request } from "express";
import { z } from "zod";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { PageOptions } from "../../lib/entities";

export type Format = "markdown" | "html" | "rawHtml" | "links" | "screenshot" | "screenshot@fullPage";

const url = z.preprocess(x => {
  if (typeof x === "string" && !/^([^.:]+:\/\/)/.test(x)) {
    if (x.startsWith("://")) {
      return "http" + x;
    } else {
      return "http://" + x;
    }
  } else {
    return x;
  }
}, z.string().url().regex(/^https?:\/\//, "URL uses unsupported protocol").refine(x => !isUrlBlocked(x), "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it."));

export const scrapeOptions = z.object({
  formats: z.enum(["markdown", "html", "rawHtml", "links", "screenshot", "screenshot@fullPage"])
    .array()
    .optional()
    .default(["markdown"]),
  headers: z.record(z.string(), z.string()).optional(),
  includeTags: z.string().array().optional(),
  excludeTags: z.string().array().optional(),
  onlyMainContent: z.boolean().default(true),
  timeout: z.number().int().positive().finite().safe().default(30000), // default?
  waitFor: z.number().int().nonnegative().finite().safe().default(0),
  parsePDF: z.boolean().default(true),
});

export type ScrapeOptions = z.infer<typeof scrapeOptions>;

export const scrapeRequestSchema = scrapeOptions.extend({
  url,
  origin: z.string().optional().default("api"),
});

// export type ScrapeRequest = {
//   url: string;
//   formats?: Format[];
//   headers?: { [K: string]: string };
//   includeTags?: string[];
//   excludeTags?: string[];
//   onlyMainContent?: boolean;
//   timeout?: number;
//   waitFor?: number;
// }

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;

const crawlerOptions = z.object({
  includePaths: z.string().array().default([]),
  excludePaths: z.string().array().default([]),
  maxDepth: z.number().default(10), // default?
  limit: z.number().default(10000), // default?
  allowBackwardLinks: z.boolean().default(false), // >> TODO: CHANGE THIS NAME???
  allowExternalLinks: z.boolean().default(false),
  ignoreSitemap: z.boolean().default(true),
});

// export type CrawlerOptions = {
//   includePaths?: string[];
//   excludePaths?: string[];
//   maxDepth?: number;
//   limit?: number;
//   allowBackwardLinks?: boolean; // >> TODO: CHANGE THIS NAME???
//   allowExternalLinks?: boolean;
//   ignoreSitemap?: boolean;
// };

export type CrawlerOptions = z.infer<typeof crawlerOptions>;

export const crawlRequestSchema = z.object({
  url,
  origin: z.string().optional().default("api"),
  crawlerOptions: crawlerOptions.default({}),
  scrapeOptions: scrapeOptions.omit({ timeout: true }).default({}),
  webhook: z.string().url().optional(),
});

// export type CrawlRequest = {
//   url: string;
//   crawlerOptions?: CrawlerOptions;
//   scrapeOptions?: Exclude<ScrapeRequest, "url">;
// };

export type CrawlRequest = z.infer<typeof crawlRequestSchema>;

export const mapRequestSchema = crawlerOptions.extend({
  url,
  origin: z.string().optional().default("api")
});

// export type MapRequest = {
//   url: string;
//   crawlerOptions?: CrawlerOptions;
// };

export type MapRequest = z.infer<typeof mapRequestSchema>;

export type Document = {
  markdown?: string,
  html?: string,
  rawHtml?: string,
  links?: string[],
  screenshot?: string,
  metadata: {
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
    dcTermsCreated?: string;
    dcDateCreated?: string;
    dcDate?: string;
    dcTermsType?: string;
    dcType?: string;
    dcTermsAudience?: string;
    dcTermsSubject?: string;
    dcSubject?: string;
    dcDescription?: string;
    dcTermsKeywords?: string;
    modifiedTime?: string;
    publishedTime?: string;
    articleTag?: string;
    articleSection?: string;
    sourceURL?: string;
    statusCode?: number;
    error?: string;
  },
}

export type ErrorResponse = {
  success: false;
  error: string;
  details?: any;
};

export type ScrapeResponse = ErrorResponse | {
  success: true;
  warning?: string;
  data: Document;
};

export interface ScrapeResponseRequestTest {
  statusCode: number;
  body: ScrapeResponse;
  error?: string;
}

export type CrawlResponse = ErrorResponse | {
  success: true;
  id: string;
  url: string;
}

export type MapResponse = ErrorResponse | {
  success: true;
  links: string[];
}

export type CrawlStatusParams = {
  jobId: string;
}

export type CrawlStatusResponse = ErrorResponse | {
  status: "scraping" | "completed" | "failed" | "cancelled",
  totalCount: number;
  creditsUsed: number;
  expiresAt: string;
  next?: string;
  data: Document[];
}

type AuthObject = {
  team_id: string;
  plan: string;
}

export interface RequestWithMaybeAuth<ReqParams = {}, ReqBody = undefined, ResBody = undefined> extends Request<ReqParams, ReqBody, ResBody> {
  auth?: AuthObject;
}

export interface RequestWithAuth<ReqParams = {}, ReqBody = undefined, ResBody = undefined> extends Request<ReqParams, ReqBody, ResBody> {
  auth: AuthObject;
}

export function legacyCrawlerOptions(x: CrawlerOptions) {
  return {
    includes: x.includePaths,
    excludes: x.excludePaths,
    maxCrawledLinks: x.limit,
    maxCrawledDepth: x.maxDepth,
    limit: x.limit,
    generateImgAltText: false,
    allowBackwardCrawling: x.allowBackwardLinks,
    allowExternalContentLinks: x.allowExternalLinks,
  };
}

export function legacyScrapeOptions(x: ScrapeOptions): PageOptions {
  return {
    includeMarkdown: x.formats.includes("markdown"),
    includeHtml: x.formats.includes("html"),
    includeRawHtml: x.formats.includes("rawHtml"),
    onlyIncludeTags: x.includeTags,
    removeTags: x.excludeTags,
    onlyMainContent: x.onlyMainContent,
    waitFor: x.waitFor,
    includeLinks: x.formats.includes("links"),
    screenshot: x.formats.includes("screenshot"),
    fullPageScreenshot: x.formats.includes("screenshot@fullPage"),
    parsePDF: x.parsePDF
  };
}

export function legacyDocumentConverter(doc: any): Document {
  return {
    markdown: doc.markdown,
    links: doc.linksOnPage,
    rawHtml: doc.rawHtml,
    html: doc.html,
    screenshot: doc.screenshot ?? doc.fullPageScreenshot,
    metadata: {
      ...doc.metadata,
      pageError: undefined,
      pageStatusCode: undefined,
      error: doc.metadata.pageError,
      statusCode: doc.metadata.pageStatusCode,
    },
  }
}
