export type Format = "markdown" | "html" | "rawHtml" | "links" | "screenshot" | "screenshot@fullPage";

export type ScrapeRequest = {
  url: string;
  formats?: Format[];
  headers?: { [K: string]: string };
  includeTags?: string[];
  excludeTags?: string[];
  onlyMainContent?: boolean;
  timeout?: number;
  waitFor?: number;
}

export type CrawlerOptions = {
  includePaths?: string[];
  excludePaths?: string[];
  maxDepth?: number;
  limit?: number;
  allowBackwardLinks?: boolean; // >> TODO: CHANGE THIS NAME???
  allowExternalLinks?: boolean;
  ignoreSitemap?: boolean;
};

export type CrawlRequest = {
  url: string;
  crawlerOptions?: CrawlerOptions;
  scrapeOptions?: Exclude<ScrapeRequest, "url">;
};

export type MapRequest = {
  url: string;
  crawlerOptions?: CrawlerOptions;
};

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
};

export type ScrapeResponse = ErrorResponse | {
  success: true;
  warning?: string;
  data: Document;
};

export type CrawlResponse = ErrorResponse | {
  success: true;
  id: string;
  url: string;
}

export type MapResponse = ErrorResponse | {
  success: true;
  links: string[];
}
