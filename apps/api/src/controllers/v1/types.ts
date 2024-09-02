import { Request, Response } from "express";
import { z } from "zod";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { ExtractorOptions, PageOptions } from "../../lib/entities";
import { protocolIncluded, checkUrl } from "../../lib/validateUrl";
import { PlanType } from "../../types";

export type Format =
  | "markdown"
  | "html"
  | "rawHtml"
  | "links"
  | "screenshot"
  | "screenshot@fullPage"
  | "extract";

export const url = z.preprocess(
  (x) => {
    if (!protocolIncluded(x as string)) {
      return `http://${x}`;
    }
    return x;
  },
  z
    .string()
    .url()
    .regex(/^https?:\/\//, "URL uses unsupported protocol")
    .refine(
      (x) => /\.[a-z]{2,}(\/|$)/i.test(x),
      "URL must have a valid top-level domain or be a valid path"
    )
    .refine(
      (x) => checkUrl(x as string),
      "Invalid URL"
    )
    .refine(
      (x) => !isUrlBlocked(x as string),
      "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it."
    )
);

const strictMessage = "Unrecognized key in body -- please review the v1 API documentation for request body changes";

export const extractOptions = z.object({
  mode: z.enum(["llm"]).default("llm"),
  schema: z.any().optional(),
  systemPrompt: z.string().default("Based on the information on the page, extract all the information from the schema. Try to extract all the fields even those that might not be marked as required."),
  prompt: z.string().optional()
}).strict(strictMessage);

export type ExtractOptions = z.infer<typeof extractOptions>;

export const scrapeOptions = z.object({
  formats: z
    .enum([
      "markdown",
      "html",
      "rawHtml",
      "links",
      "screenshot",
      "screenshot@fullPage",
      "extract"
    ])
    .array()
    .optional()
    .default(["markdown"]),
  headers: z.record(z.string(), z.string()).optional(),
  includeTags: z.string().array().optional(),
  excludeTags: z.string().array().optional(),
  onlyMainContent: z.boolean().default(true),
  timeout: z.number().int().positive().finite().safe().default(30000),
  waitFor: z.number().int().nonnegative().finite().safe().default(0),
  extract: extractOptions.optional(),
  parsePDF: z.boolean().default(true),
}).strict(strictMessage)


export type ScrapeOptions = z.infer<typeof scrapeOptions>;

export const scrapeRequestSchema = scrapeOptions.extend({
  url,
  origin: z.string().optional().default("api"),
}).strict(strictMessage).refine(
  (obj) => {
    const hasExtractFormat = obj.formats?.includes("extract");
    const hasExtractOptions = obj.extract !== undefined;
    return (hasExtractFormat && hasExtractOptions) || (!hasExtractFormat && !hasExtractOptions);
  },
  {
    message: "When 'extract' format is specified, 'extract' options must be provided, and vice versa",
  }
).transform((obj) => {
  if ((obj.formats?.includes("extract") || obj.extract) && !obj.timeout) {
    return { ...obj, timeout: 60000 };
  }
  return obj;
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
}).strict(strictMessage);

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

export const crawlRequestSchema = crawlerOptions.extend({
  url,
  origin: z.string().optional().default("api"),
  scrapeOptions: scrapeOptions.omit({ timeout: true }).default({}),
  webhook: z.string().url().optional(),
  limit: z.number().default(10000),
}).strict(strictMessage);

// export type CrawlRequest = {
//   url: string;
//   crawlerOptions?: CrawlerOptions;
//   scrapeOptions?: Exclude<ScrapeRequest, "url">;
// };

// export type ExtractorOptions = {
//   mode: "markdown" | "llm-extraction" | "llm-extraction-from-markdown" | "llm-extraction-from-raw-html";
//   extractionPrompt?: string;
//   extractionSchema?: Record<string, any>;
// }


export type CrawlRequest = z.infer<typeof crawlRequestSchema>;

export const mapRequestSchema = crawlerOptions.extend({
  url,
  origin: z.string().optional().default("api"),
  includeSubdomains: z.boolean().default(true),
  search: z.string().optional(),
  ignoreSitemap: z.boolean().default(false),
  limit: z.number().min(1).max(5000).default(5000).optional(),
}).strict(strictMessage);

// export type MapRequest = {
//   url: string;
//   crawlerOptions?: CrawlerOptions;
// };

export type MapRequest = z.infer<typeof mapRequestSchema>;

export type Document = {
  markdown?: string;
  extract?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
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
  };
};

export type ErrorResponse = {
  success: false;
  error: string;
  details?: any;
};

export type ScrapeResponse =
  | ErrorResponse
  | {
      success: true;
      warning?: string;
      data: Document;
      scrape_id?: string;
    };

export interface ScrapeResponseRequestTest {
  statusCode: number;
  body: ScrapeResponse;
  error?: string;
}

export type CrawlResponse =
  | ErrorResponse
  | {
      success: true;
      id: string;
      url: string;
    };

export type MapResponse =
  | ErrorResponse
  | {
      success: true;
      links: string[];
      scrape_id?: string;
    };

export type CrawlStatusParams = {
  jobId: string;
};

export type CrawlStatusResponse =
  | ErrorResponse
  | {
      status: "scraping" | "completed" | "failed" | "cancelled";
      completed: number;
      total: number;
      creditsUsed: number;
      expiresAt: string;
      next?: string;
      data: Document[];
    };

type AuthObject = {
  team_id: string;
  plan: PlanType;
};

type Account = {
  remainingCredits: number;
};

export interface RequestWithMaybeAuth<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined
> extends Request<ReqParams, ReqBody, ResBody> {
  auth?: AuthObject;
  account?: Account;
}

export interface RequestWithAuth<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined,
> extends Request<ReqParams, ReqBody, ResBody> {
  auth: AuthObject;
  account?: Account;
}

export interface ResponseWithSentry<
  ResBody = undefined,
> extends Response<ResBody> {
  sentry?: string,
}

export function legacyCrawlerOptions(x: CrawlerOptions) {
  return {
    includes: x.includePaths,
    excludes: x.excludePaths,
    maxCrawledLinks: x.limit,
    maxDepth: x.maxDepth,
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
    includeExtract: x.formats.includes("extract"),
    onlyIncludeTags: x.includeTags,
    removeTags: x.excludeTags,
    onlyMainContent: x.onlyMainContent,
    waitFor: x.waitFor,
    includeLinks: x.formats.includes("links"),
    screenshot: x.formats.includes("screenshot"),
    fullPageScreenshot: x.formats.includes("screenshot@fullPage"),
    parsePDF: x.parsePDF,
  };
}

export function legacyExtractorOptions(x: ExtractOptions): ExtractorOptions {
  return {
    mode: x.mode ? "llm-extraction" : "markdown",
    extractionPrompt: x.prompt ?? "Based on the information on the page, extract the information from the schema.",
    extractionSchema: x.schema,
    userPrompt: x.prompt ?? "",
  };
}

export function legacyDocumentConverter(doc: any): Document {
  if (doc === null || doc === undefined) return doc;

  if (doc.metadata) {
    if (doc.metadata.screenshot) {
      doc.screenshot = doc.metadata.screenshot;
      delete doc.metadata.screenshot;
    }

    if (doc.metadata.fullPageScreenshot) {
      doc.fullPageScreenshot = doc.metadata.fullPageScreenshot;
      delete doc.metadata.fullPageScreenshot;
    }
  }

  return {
    markdown: doc.markdown,
    links: doc.linksOnPage,
    rawHtml: doc.rawHtml,
    html: doc.html,
    extract: doc.llm_extraction,
    screenshot: doc.screenshot ?? doc.fullPageScreenshot,
    metadata: {
      ...doc.metadata,
      pageError: undefined,
      pageStatusCode: undefined,
      error: doc.metadata.pageError,
      statusCode: doc.metadata.pageStatusCode,
    },
  };
}
