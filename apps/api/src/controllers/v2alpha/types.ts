import z from "zod";
import { ScrapeActionContent } from "../../lib/entities";
import { IntegrationEnum, url, webhookSchema, actionsSchema, ErrorResponse } from "../v1/types";
import { countries } from "../../lib/validate-country";

const strictMessage = "Unrecognized key in body -- please review the v1 API documentation for request body changes";

export const extractOptions = z
  .object({
    mode: z.enum(["llm"]).default("llm"),
    schema: z.any().optional(),
    systemPrompt: z
      .string()
      .max(10000)
      .default(""),
    prompt: z.string().max(10000).optional(),
    temperature: z.number().optional(),
  })
  .strict(strictMessage)
  .transform((data) => ({
    ...data,
    systemPrompt: "Based on the information on the page, extract all the information from the schema in JSON format. Try to extract all the fields even those that might not be marked as required."
  }));

const baseScrapeOptions = z
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
        "changeTracking",
      ])
      .array()
      .optional()
      .default([])
      .refine(
        (x) => !(x.includes("screenshot") && x.includes("screenshot@fullPage")),
        "You may only specify either screenshot or screenshot@fullPage",
      )
      .refine(
        (x) => !x.includes("changeTracking") || x.includes("markdown"),
        "The changeTracking format requires the markdown format to be specified as well",
      ),
    headers: z.record(z.string(), z.string()).optional(),
    includeTags: z.string().array().optional(),
    excludeTags: z.string().array().optional(),
    onlyMainContent: z.boolean().default(true),
    timeout: z.number().int().positive().finite().safe().optional(),
    waitFor: z
      .number()
      .int()
      .nonnegative()
      .finite()
      .safe()
      .max(60000)
      .default(0),
    // Deprecate this to jsonOptions
    extract: extractOptions.optional(),
    // New
    jsonOptions: extractOptions.optional(),
    changeTrackingOptions: z
      .object({
        prompt: z.string().optional(),
        schema: z.any().optional(),
        modes: z.enum(["json", "git-diff"]).array().optional().default([]),
        tag: z.string().or(z.null()).default(null),
      })
      .optional(),
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
            (val) =>
              !val ||
              Object.keys(countries).includes(val.toUpperCase()) ||
              val === "US-generic",
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
    proxy: z.enum(["basic", "stealth", "auto"]).optional(),
    maxAge: z.number().int().gte(0).safe().default(0),
    storeInCache: z.boolean().default(true),
    // @deprecated
    __experimental_cache: z.boolean().default(false).optional(),
    __searchPreviewToken: z.string().optional(),
  })
  .strict(strictMessage);

const fire1Refine = (obj) => {
  if (obj.agent?.model?.toLowerCase() === "fire-1" && obj.jsonOptions?.agent?.model?.toLowerCase() === "fire-1") {
    return false;
  }
  return true;
}
const fire1RefineOpts = {
  message: "You may only specify the FIRE-1 model in agent or jsonOptions.agent, but not both.",
};
const extractRefine = (obj) => {
  const hasExtractFormat = obj.formats?.includes("extract");
  const hasExtractOptions = obj.extract !== undefined;
  const hasJsonFormat = obj.formats?.includes("json");
  const hasJsonOptions = obj.jsonOptions !== undefined;
  return (
    ((hasExtractFormat && hasExtractOptions) ||
      (!hasExtractFormat && !hasExtractOptions)) &&
    ((hasJsonFormat && hasJsonOptions) || (!hasJsonFormat && !hasJsonOptions))
  );
};
const extractRefineOpts = {
  message:
    "When 'extract' or 'json' format is specified, corresponding options must be provided, and vice versa",
};
const extractTransform = (obj) => {
  // Handle timeout
  if (
    (obj.formats?.includes("extract") ||
      obj.extract ||
      obj.formats?.includes("json") ||
      obj.jsonOptions) &&
    obj.timeout === 30000
  ) {
    obj = { ...obj, timeout: 60000 };
  }

  if (obj.formats?.includes("changeTracking") && (obj.waitFor === undefined || obj.waitFor < 5000)) {
    obj = { ...obj, waitFor: 5000 };
  }

  if (obj.formats?.includes("changeTracking") && obj.timeout === 30000) {
    obj = { ...obj, timeout: 60000 };
  }

  if (obj.agent) {
    obj = { ...obj, timeout: 300000 };
  }

  if ((obj.proxy === "stealth" || obj.proxy === "auto") && obj.timeout === 30000) {
    obj = { ...obj, timeout: 120000 };
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
        agent: obj.jsonOptions.agent,
        mode: "llm",
      },
    };
  }

  return obj;
};

const crawlerOptions = z
  .object({
    includePaths: z.string().array().default([]),
    excludePaths: z.string().array().default([]),
    maxDepth: z.number().default(10), // default?
    maxDiscoveryDepth: z.number().optional(),
    limit: z.number().default(10000), // default?
    allowBackwardLinks: z.boolean().default(false), // DEPRECATED: use crawlEntireDomain
    crawlEntireDomain: z.boolean().optional(),
    allowExternalLinks: z.boolean().default(false),
    allowSubdomains: z.boolean().default(false),
    ignoreRobotsTxt: z.boolean().default(false),
    ignoreSitemap: z.boolean().default(false),
    deduplicateSimilarURLs: z.boolean().default(true),
    ignoreQueryParameters: z.boolean().default(false),
    regexOnFullURL: z.boolean().default(false),
    delay: z.number().positive().optional(),
    mode: z.enum(["fast", "detailed"]).default("fast"),
  })
  .strict(strictMessage);

export type CrawlerOptions = z.infer<typeof crawlerOptions>;

export const crawlRequestSchema = crawlerOptions
  .extend({
    url,
    origin: z.string().optional().default("api"),
    integration: z.nativeEnum(IntegrationEnum).optional().transform(val => val || null),
    scrapeOptions: baseScrapeOptions.default({}),
    webhook: webhookSchema.optional(),
    limit: z.number().default(10000),
    maxConcurrency: z.number().positive().int().optional(),
  })
  .strict(strictMessage)
  .refine((x) => extractRefine(x.scrapeOptions), extractRefineOpts)
  .refine((x) => fire1Refine(x.scrapeOptions), fire1RefineOpts)
  .transform((x) => {
    if (x.crawlEntireDomain !== undefined) {
      x.allowBackwardLinks = x.crawlEntireDomain;
    }
    return {
      ...x,
      scrapeOptions: extractTransform(x.scrapeOptions),
    };
  });

export type CrawlRequest = z.infer<typeof crawlRequestSchema>;

export function toLegacyCrawlerOptions(x: CrawlerOptions) {
  return {
    includes: x.includePaths,
    excludes: x.excludePaths,
    maxCrawledLinks: x.limit,
    maxDepth: x.maxDepth,
    limit: x.limit,
    generateImgAltText: false,
    allowBackwardCrawling: x.crawlEntireDomain ?? x.allowBackwardLinks,
    allowExternalContentLinks: x.allowExternalLinks,
    allowSubdomains: x.allowSubdomains,
    ignoreRobotsTxt: x.ignoreRobotsTxt,
    ignoreSitemap: x.ignoreSitemap,
    deduplicateSimilarURLs: x.deduplicateSimilarURLs,
    ignoreQueryParameters: x.ignoreQueryParameters,
    regexOnFullURL: x.regexOnFullURL,
    maxDiscoveryDepth: x.maxDiscoveryDepth,
    currentDiscoveryDepth: 0,
    delay: x.delay,
  };
}

export type CrawlResponse =
  | ErrorResponse
  | {
      success: true;
      id: string;
      url: string;
    };

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
    javascriptReturns?: {
      type: string;
      value: unknown;
    }[];
  };
  changeTracking?: {
    previousScrapeAt: string | null;
    changeStatus: "new" | "same" | "changed" | "removed";
    visibility: "visible" | "hidden";
    diff?: {
      text: string;
      json: {
        files: Array<{
          from: string | null;
          to: string | null;
          chunks: Array<{
            content: string;
            changes: Array<{
              type: string;
              normal?: boolean;
              ln?: number;
              ln1?: number;
              ln2?: number;
              content: string;
            }>;
          }>;
        }>;
      };
    };
    json?: any;
  }
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
    favicon?: string;
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
    numPages?: number;
    contentType?: string;
    proxyUsed: "basic" | "stealth";
    cacheState?: "hit" | "miss";
    cachedAt?: string;
    creditsUsed?: number;
    // [key: string]: string | string[] | number | { smartScrape: number; other: number; total: number } | undefined;
  };
};