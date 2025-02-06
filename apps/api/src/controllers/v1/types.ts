import { Request, Response } from "express";
import { z } from "zod";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { protocolIncluded, checkUrl } from "../../lib/validateUrl";
import { PlanType } from "../../types";
import { countries } from "../../lib/validate-country";
import {
  ExtractorOptions,
  PageOptions,
  ScrapeActionContent,
  Document as V0Document,
} from "../../lib/entities";
import { InternalOptions } from "../../scraper/scrapeURL";
import { BLOCKLISTED_URL_MESSAGE } from "../../lib/strings";

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
      (x) => /\.[a-zA-Z\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]{2,}(:\d+)?([\/?#]|$)/i.test(x),
      "URL must have a valid top-level domain or be a valid path",
    )
    .refine((x) => {
      try {
        checkUrl(x as string);
        return true;
      } catch (_) {
        return false;
      }
    }, "Invalid URL")
    .refine((x) => !isUrlBlocked(x as string), BLOCKLISTED_URL_MESSAGE),
);

const strictMessage =
  "Unrecognized key in body -- please review the v1 API documentation for request body changes";

export const extractOptions = z
  .object({
    mode: z.enum(["llm"]).default("llm"),
    schema: z.any().optional(),
    systemPrompt: z
      .string()
      .max(10000)
      .default(
        "Based on the information on the page, extract all the information from the schema in JSON format. Try to extract all the fields even those that might not be marked as required.",
      ),
    prompt: z.string().max(10000).optional(),
  })
  .strict(strictMessage);

export type ExtractOptions = z.infer<typeof extractOptions>;

export const actionsSchema = z.array(
  z.union([
    z
      .object({
        type: z.literal("wait"),
        milliseconds: z.number().int().positive().finite().optional(),
        selector: z.string().optional(),
      })
      .refine(
        (data) =>
          (data.milliseconds !== undefined || data.selector !== undefined) &&
          !(data.milliseconds !== undefined && data.selector !== undefined),
        {
          message:
            "Either 'milliseconds' or 'selector' must be provided, but not both.",
        },
      ),
    z.object({
      type: z.literal("click"),
      selector: z.string(),
    }),
    z.object({
      type: z.literal("screenshot"),
      fullPage: z.boolean().default(false),
    }),
    z.object({
      type: z.literal("write"),
      text: z.string(),
    }),
    z.object({
      type: z.literal("press"),
      key: z.string(),
    }),
    z.object({
      type: z.literal("scroll"),
      direction: z.enum(["up", "down"]).optional().default("down"),
      selector: z.string().optional(),
    }),
    z.object({
      type: z.literal("scrape"),
    }),
    z.object({
      type: z.literal("executeJavascript"),
      script: z.string(),
    }),
  ]),
);

export const scrapeOptions = z
  .object({
    formats: z
      .enum([
        "markdown",
        "html",
        "rawHtml",
        "links",
        "screenshot",
        "screenshot@fullPage",
        "extract",
        "json",
      ])
      .array()
      .optional()
      .default(["markdown"])
      .refine(
        (x) => !(x.includes("screenshot") && x.includes("screenshot@fullPage")),
        "You may only specify either screenshot or screenshot@fullPage",
      ),
    headers: z.record(z.string(), z.string()).optional(),
    includeTags: z.string().array().optional(),
    excludeTags: z.string().array().optional(),
    onlyMainContent: z.boolean().default(true),
    timeout: z.number().int().positive().finite().safe().optional(),
    waitFor: z.number().int().nonnegative().finite().safe().max(30000).default(0),
    // Deprecate this to jsonOptions
    extract: extractOptions.optional(),
    // New
    jsonOptions: extractOptions.optional(),
    mobile: z.boolean().default(false),
    parsePDF: z.boolean().default(true),
    actions: actionsSchema.optional(),
    // New
    location: z
      .object({
        country: z
          .string()
          .optional()
          .refine(
            (val) => !val || Object.keys(countries).includes(val.toUpperCase()) || val === "US-generic",
            {
              message:
                "Invalid country code. Please use a valid ISO 3166-1 alpha-2 country code.",
            },
          )
          .transform((val) => (val ? val.toUpperCase() : "US-generic")),
        languages: z.string().array().optional(),
      })
      .optional(),

    // Deprecated
    geolocation: z
      .object({
        country: z
          .string()
          .optional()
          .refine(
            (val) => !val || Object.keys(countries).includes(val.toUpperCase()),
            {
              message:
                "Invalid country code. Please use a valid ISO 3166-1 alpha-2 country code.",
            },
          )
          .transform((val) => (val ? val.toUpperCase() : "US-generic")),
        languages: z.string().array().optional(),
      })
      .optional(),
    skipTlsVerification: z.boolean().default(false),
    removeBase64Images: z.boolean().default(true),
    fastMode: z.boolean().default(false),
    useMock: z.string().optional(),
    blockAds: z.boolean().default(true),
  })
  .strict(strictMessage);

export type ScrapeOptions = z.infer<typeof scrapeOptions>;

import Ajv from "ajv";

const ajv = new Ajv();

export const extractV1Options = z
  .object({
    urls: url
      .array()
      .max(10, "Maximum of 10 URLs allowed per request while in beta."),
    prompt: z.string().max(10000).optional(),
    systemPrompt: z.string().max(10000).optional(),
    schema: z
      .any()
      .optional()
      .refine(
        (val) => {
          if (!val) return true; // Allow undefined schema
          try {
            const validate = ajv.compile(val);
            return typeof validate === "function";
          } catch (e) {
            return false;
          }
        },
        {
          message: "Invalid JSON schema.",
        },
      ),
    limit: z.number().int().positive().finite().safe().optional(),
    ignoreSitemap: z.boolean().default(false),
    includeSubdomains: z.boolean().default(true),
    allowExternalLinks: z.boolean().default(false),
    enableWebSearch: z.boolean().default(false),
    origin: z.string().optional().default("api"),
    urlTrace: z.boolean().default(false),
    timeout: z.number().int().positive().finite().safe().default(60000),
    __experimental_streamSteps: z.boolean().default(false),
    __experimental_llmUsage: z.boolean().default(false),
    __experimental_showSources: z.boolean().default(false),
    __experimental_cacheKey: z.string().optional(),
    __experimental_cacheMode: z.enum(["direct", "save", "load"]).default("direct").optional()
  })
  .strict(strictMessage)
  .transform((obj) => ({
    ...obj,
    allowExternalLinks: obj.allowExternalLinks || obj.enableWebSearch,
  }));

export type ExtractV1Options = z.infer<typeof extractV1Options>;
export const extractRequestSchema = extractV1Options;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export const scrapeRequestSchema = scrapeOptions
  .omit({ timeout: true })
  .extend({
    url,
    origin: z.string().optional().default("api"),
    timeout: z.number().int().positive().finite().safe().default(30000),
  })
  .strict(strictMessage)
  .refine(
    (obj) => {
      const hasExtractFormat = obj.formats?.includes("extract");
      const hasExtractOptions = obj.extract !== undefined;
      const hasJsonFormat = obj.formats?.includes("json");
      const hasJsonOptions = obj.jsonOptions !== undefined;
      return (
        (hasExtractFormat && hasExtractOptions) ||
        (!hasExtractFormat && !hasExtractOptions) ||
        (hasJsonFormat && hasJsonOptions) ||
        (!hasJsonFormat && !hasJsonOptions)
      );
    },
    {
      message:
        "When 'extract' or 'json' format is specified, corresponding options must be provided, and vice versa",
    },
  )
  .transform((obj) => {
    // Handle timeout
    if (
      (obj.formats?.includes("extract") ||
        obj.extract ||
        obj.formats?.includes("json") ||
        obj.jsonOptions) &&
      !obj.timeout
    ) {
      obj = { ...obj, timeout: 60000 };
    }

    if (obj.formats?.includes("json")) {
      obj.formats.push("extract");
    }

    // Convert JSON options to extract options if needed
    if (obj.jsonOptions && !obj.extract) {
      obj = {
        ...obj,
        extract: {
          prompt: obj.jsonOptions.prompt,
          systemPrompt: obj.jsonOptions.systemPrompt,
          schema: obj.jsonOptions.schema,
          mode: "llm",
        },
      };
    }

    return obj;
  });

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;
export type ScrapeRequestInput = z.input<typeof scrapeRequestSchema>;

export const webhookSchema = z.preprocess(
  (x) => {
    if (typeof x === "string") {
      return { url: x };
    } else {
      return x;
    }
  },
  z
    .object({
      url: z.string().url(),
      headers: z.record(z.string(), z.string()).default({}),
      metadata: z.record(z.string(), z.string()).default({}),
      events: z.array(z.enum(["completed", "failed", "page", "started"])).default(["completed", "failed", "page", "started"]),
    })
    .strict(strictMessage),
);

export const batchScrapeRequestSchema = scrapeOptions
  .extend({
    urls: url.array(),
    origin: z.string().optional().default("api"),
    webhook: webhookSchema.optional(),
    appendToId: z.string().uuid().optional(),
    ignoreInvalidURLs: z.boolean().default(false),
  })
  .strict(strictMessage)
  .refine(
    (obj) => {
      const hasExtractFormat = obj.formats?.includes("extract");
      const hasExtractOptions = obj.extract !== undefined;
      return (
        (hasExtractFormat && hasExtractOptions) ||
        (!hasExtractFormat && !hasExtractOptions)
      );
    },
    {
      message:
        "When 'extract' format is specified, 'extract' options must be provided, and vice versa",
    },
  );

export const batchScrapeRequestSchemaNoURLValidation = scrapeOptions
  .extend({
    urls: z.string().array(),
    origin: z.string().optional().default("api"),
    webhook: webhookSchema.optional(),
    appendToId: z.string().uuid().optional(),
    ignoreInvalidURLs: z.boolean().default(false),
  })
  .strict(strictMessage)
  .refine(
    (obj) => {
      const hasExtractFormat = obj.formats?.includes("extract");
      const hasExtractOptions = obj.extract !== undefined;
      return (
        (hasExtractFormat && hasExtractOptions) ||
        (!hasExtractFormat && !hasExtractOptions)
      );
    },
    {
      message:
        "When 'extract' format is specified, 'extract' options must be provided, and vice versa",
    },
  );

export type BatchScrapeRequest = z.infer<typeof batchScrapeRequestSchema>;

const crawlerOptions = z
  .object({
    includePaths: z.string().array().default([]),
    excludePaths: z.string().array().default([]),
    maxDepth: z.number().default(10), // default?
    limit: z.number().default(10000), // default?
    allowBackwardLinks: z.boolean().default(false), // >> TODO: CHANGE THIS NAME???
    allowExternalLinks: z.boolean().default(false),
    allowSubdomains: z.boolean().default(false),
    ignoreRobotsTxt: z.boolean().default(false),
    ignoreSitemap: z.boolean().default(false),
    deduplicateSimilarURLs: z.boolean().default(true),
    ignoreQueryParameters: z.boolean().default(false),
  })
  .strict(strictMessage);

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

export const crawlRequestSchema = crawlerOptions
  .extend({
    url,
    origin: z.string().optional().default("api"),
    scrapeOptions: scrapeOptions.default({}),
    webhook: webhookSchema.optional(),
    limit: z.number().default(10000),
  })
  .strict(strictMessage);

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

export const mapRequestSchema = crawlerOptions
  .extend({
    url,
    origin: z.string().optional().default("api"),
    includeSubdomains: z.boolean().default(true),
    search: z.string().optional(),
    ignoreSitemap: z.boolean().default(false),
    sitemapOnly: z.boolean().default(false),
    limit: z.number().min(1).max(5000).default(5000),
    timeout: z.number().positive().finite().optional(),
  })
  .strict(strictMessage);

// export type MapRequest = {
//   url: string;
//   crawlerOptions?: CrawlerOptions;
// };

export type MapRequest = z.infer<typeof mapRequestSchema>;
export type MapRequestInput = z.input<typeof mapRequestSchema>;

export type Document = {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
  extract?: any;
  json?: any;
  warning?: string;
  actions?: {
    screenshots?: string[];
    scrapes?: ScrapeActionContent[];
  };
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
    url?: string;
    sourceURL?: string;
    statusCode: number;
    scrapeId?: string;
    error?: string;
    [key: string]: string | string[] | number | undefined;
  };
  serpResults?: {
    title: string;
    description: string;
    url: string;
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

export interface URLTrace {
  url: string;
  status: "mapped" | "scraped" | "error";
  timing: {
    discoveredAt: string;
    scrapedAt?: string;
    completedAt?: string;
  };
  error?: string;
  warning?: string;
  contentStats?: {
    rawContentLength: number;
    processedContentLength: number;
    tokensUsed: number;
  };
  relevanceScore?: number;
  usedInCompletion?: boolean;
  extractedFields?: string[];
}

export interface ExtractResponse {
  success: boolean;
  error?: string;
  data?: any;
  scrape_id?: string;
  id?: string;
  warning?: string;
  urlTrace?: URLTrace[];
  sources?: {
    [key: string]: string[];
  };
}

export interface ExtractResponseRequestTest {
  statusCode: number;
  body: ExtractResponse;
  error?: string;
}

export type CrawlResponse =
  | ErrorResponse
  | {
      success: true;
      id: string;
      url: string;
    };

export type BatchScrapeResponse =
  | ErrorResponse
  | {
      success: true;
      id: string;
      url: string;
      invalidURLs?: string[];
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

export type ConcurrencyCheckParams = {
  teamId: string;
};

export type ConcurrencyCheckResponse =
  | ErrorResponse
  | {
      success: true;
      concurrency: number;
      maxConcurrency: number;
    };

export type CrawlStatusResponse =
  | ErrorResponse
  | {
      success: true;
      status: "scraping" | "completed" | "failed" | "cancelled";
      completed: number;
      total: number;
      creditsUsed: number;
      expiresAt: string;
      next?: string;
      data: Document[];
    };

export type CrawlErrorsResponse =
  | ErrorResponse
  | {
      errors: {
        id: string;
        timestamp?: string;
        url: string;
        error: string;
      }[];
      robotsBlocked: string[];
    };

type AuthObject = {
  team_id: string;
  plan: PlanType | undefined;
};

type Account = {
  remainingCredits: number;
};

export type AuthCreditUsageChunk = {
  api_key: string;
  team_id: string;
  sub_id: string | null;
  sub_current_period_start: string | null;
  sub_current_period_end: string | null;
  price_id: string | null;
  price_credits: number; // credit limit with assoicated price, or free_credits (500) if free plan
  credits_used: number;
  coupon_credits: number; // do not rely on this number to be up to date after calling a billTeam
  coupons: any[];
  adjusted_credits_used: number; // credits this period minus coupons used
  remaining_credits: number;
  sub_user_id: string | null;
  total_credits_sum: number;
  is_extract?: boolean;
};

export interface RequestWithMaybeACUC<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined,
> extends Request<ReqParams, ReqBody, ResBody> {
  acuc?: AuthCreditUsageChunk;
}

export interface RequestWithACUC<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined,
> extends Request<ReqParams, ReqBody, ResBody> {
  acuc: AuthCreditUsageChunk;
}

export interface RequestWithAuth<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined,
> extends Request<ReqParams, ReqBody, ResBody> {
  auth: AuthObject;
  account?: Account;
}

export interface RequestWithMaybeAuth<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined,
> extends RequestWithMaybeACUC<ReqParams, ReqBody, ResBody> {
  auth?: AuthObject;
  account?: Account;
}

export interface RequestWithAuth<
  ReqParams = {},
  ReqBody = undefined,
  ResBody = undefined,
> extends RequestWithACUC<ReqParams, ReqBody, ResBody> {
  auth: AuthObject;
  account?: Account;
}

export interface ResponseWithSentry<ResBody = undefined>
  extends Response<ResBody> {
  sentry?: string;
}

export function toLegacyCrawlerOptions(x: CrawlerOptions) {
  return {
    includes: x.includePaths,
    excludes: x.excludePaths,
    maxCrawledLinks: x.limit,
    maxDepth: x.maxDepth,
    limit: x.limit,
    generateImgAltText: false,
    allowBackwardCrawling: x.allowBackwardLinks,
    allowExternalContentLinks: x.allowExternalLinks,
    allowSubdomains: x.allowSubdomains,
    ignoreRobotsTxt: x.ignoreRobotsTxt,
    ignoreSitemap: x.ignoreSitemap,
    deduplicateSimilarURLs: x.deduplicateSimilarURLs,
    ignoreQueryParameters: x.ignoreQueryParameters,
  };
}

export function fromLegacyCrawlerOptions(x: any): {
  crawlOptions: CrawlerOptions;
  internalOptions: InternalOptions;
} {
  return {
    crawlOptions: crawlerOptions.parse({
      includePaths: x.includes,
      excludePaths: x.excludes,
      limit: x.maxCrawledLinks ?? x.limit,
      maxDepth: x.maxDepth,
      allowBackwardLinks: x.allowBackwardCrawling,
      allowExternalLinks: x.allowExternalContentLinks,
      allowSubdomains: x.allowSubdomains,
      ignoreRobotsTxt: x.ignoreRobotsTxt,
      ignoreSitemap: x.ignoreSitemap,
      deduplicateSimilarURLs: x.deduplicateSimilarURLs,
      ignoreQueryParameters: x.ignoreQueryParameters,
    }),
    internalOptions: {
      v0CrawlOnlyUrls: x.returnOnlyUrls,
    },
  };
}

export interface MapDocument {
  url: string;
  title?: string;
  description?: string;
}
export function fromLegacyScrapeOptions(
  pageOptions: PageOptions,
  extractorOptions: ExtractorOptions | undefined,
  timeout: number | undefined,
): { scrapeOptions: ScrapeOptions; internalOptions: InternalOptions } {
  return {
    scrapeOptions: scrapeOptions.parse({
      formats: [
        (pageOptions.includeMarkdown ?? true) ? ("markdown" as const) : null,
        (pageOptions.includeHtml ?? false) ? ("html" as const) : null,
        (pageOptions.includeRawHtml ?? false) ? ("rawHtml" as const) : null,
        (pageOptions.screenshot ?? false) ? ("screenshot" as const) : null,
        (pageOptions.fullPageScreenshot ?? false)
          ? ("screenshot@fullPage" as const)
          : null,
        extractorOptions !== undefined &&
        extractorOptions.mode.includes("llm-extraction")
          ? ("extract" as const)
          : null,
        "links",
      ].filter((x) => x !== null),
      waitFor: pageOptions.waitFor,
      headers: pageOptions.headers,
      includeTags:
        typeof pageOptions.onlyIncludeTags === "string"
          ? [pageOptions.onlyIncludeTags]
          : pageOptions.onlyIncludeTags,
      excludeTags:
        typeof pageOptions.removeTags === "string"
          ? [pageOptions.removeTags]
          : pageOptions.removeTags,
      onlyMainContent: pageOptions.onlyMainContent ?? false,
      timeout: timeout,
      parsePDF: pageOptions.parsePDF,
      actions: pageOptions.actions,
      location: pageOptions.geolocation,
      skipTlsVerification: pageOptions.skipTlsVerification,
      removeBase64Images: pageOptions.removeBase64Images,
      extract:
        extractorOptions !== undefined &&
        extractorOptions.mode.includes("llm-extraction")
          ? {
              systemPrompt: extractorOptions.extractionPrompt,
              prompt: extractorOptions.userPrompt,
              schema: extractorOptions.extractionSchema,
            }
          : undefined,
      mobile: pageOptions.mobile,
      fastMode: pageOptions.useFastMode,
    }),
    internalOptions: {
      atsv: pageOptions.atsv,
      v0DisableJsDom: pageOptions.disableJsDom,
    },
    // TODO: fallback, fetchPageContent, replaceAllPathsWithAbsolutePaths, includeLinks
  };
}

export function fromLegacyCombo(
  pageOptions: PageOptions,
  extractorOptions: ExtractorOptions | undefined,
  timeout: number | undefined,
  crawlerOptions: any,
): { scrapeOptions: ScrapeOptions; internalOptions: InternalOptions } {
  const { scrapeOptions, internalOptions: i1 } = fromLegacyScrapeOptions(
    pageOptions,
    extractorOptions,
    timeout,
  );
  const { internalOptions: i2 } = fromLegacyCrawlerOptions(crawlerOptions);
  return { scrapeOptions, internalOptions: Object.assign(i1, i2) };
}

export function toLegacyDocument(
  document: Document,
  internalOptions: InternalOptions,
): V0Document | { url: string } {
  if (internalOptions.v0CrawlOnlyUrls) {
    return { url: document.metadata.sourceURL! };
  }

  return {
    content: document.markdown!,
    markdown: document.markdown!,
    html: document.html,
    rawHtml: document.rawHtml,
    linksOnPage: document.links,
    llm_extraction: document.extract,
    metadata: {
      ...document.metadata,
      error: undefined,
      statusCode: undefined,
      pageError: document.metadata.error,
      pageStatusCode: document.metadata.statusCode,
      screenshot: document.screenshot,
    },
    actions: document.actions,
    warning: document.warning,
  };
}

export const searchRequestSchema = z
  .object({
    query: z.string(),
    limit: z
      .number()
      .int()
      .positive()
      .finite()
      .safe()
      .max(20)
      .optional()
      .default(5),
    tbs: z.string().optional(),
    filter: z.string().optional(),
    lang: z.string().optional().default("en"),
    country: z.string().optional().default("us"),
    location: z.string().optional(),
    origin: z.string().optional().default("api"),
    timeout: z.number().int().positive().finite().safe().default(60000),
    scrapeOptions: scrapeOptions
      .extend({
        formats: z
          .array(
            z.enum([
              "markdown",
              "html",
              "rawHtml",
              "links",
              "screenshot",
              "screenshot@fullPage",
              "extract",
            ]),
          )
          .default([]),
      })
      .default({}),
  })
  .strict(
    "Unrecognized key in body -- please review the v1 API documentation for request body changes",
  );

export type SearchRequest = z.infer<typeof searchRequestSchema>;

export type SearchResponse =
  | ErrorResponse
  | {
      success: true;
      warning?: string;
      data: Document[];
    };

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  step?: string;
  model?: string;
};
