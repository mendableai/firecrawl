export interface Progress {
  current: number;
  total: number;
  status: string;
  metadata?: {
    sourceURL?: string;
    [key: string]: any;
  };
  currentDocumentUrl?: string;
}

export type PageOptions = {
  onlyMainContent?: boolean;
  fallback?: boolean;
  fetchPageContent?: boolean;
  
};

export type ExtractorOptions = {
  mode: "markdown" | "llm-extraction";
  extractionPrompt?: string;
  extractionSchema?: Record<string, any>;
}

export type SearchOptions = {
  limit?: number;
  tbs?: string;
  filter?: string;
  lang?: string;
  country?: string;
  location?: string;
};

export type WebScraperOptions = {
  urls: string[];
  mode: "single_urls" | "sitemap" | "crawl";
  crawlerOptions?: {
    returnOnlyUrls?: boolean;
    includes?: string[];
    excludes?: string[];
    maxCrawledLinks?: number;
    limit?: number;
    generateImgAltText?: boolean;
    replaceAllPathsWithAbsolutePaths?: boolean;
  };
  pageOptions?: PageOptions;
  extractorOptions?: ExtractorOptions;
  concurrentRequests?: number;
};

export interface DocumentUrl {
  url: string;
}

export class Document {
  id?: string;
  url?: string; // Used only in /search for now
  content: string;
  markdown?: string;
  html?: string;
  llm_extraction?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  type?: string;
  metadata: {
    sourceURL?: string;
    [key: string]: any;
  };
  childrenLinks?: string[];
  provider?: string;

  constructor(data: Partial<Document>) {
    if (!data.content) {
      throw new Error("Missing required fields");
    }
    this.content = data.content;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.type = data.type || "unknown";
    this.metadata = data.metadata || { sourceURL: "" };
    this.markdown = data.markdown || "";
    this.childrenLinks = data.childrenLinks || undefined;
    this.provider = data.provider || undefined;
  }
}


export class SearchResult {
  url: string;
  title: string;
  description: string;

  constructor(url: string, title: string, description: string) {
      this.url = url;
      this.title = title;
      this.description = description;
  }

  toString(): string {
      return `SearchResult(url=${this.url}, title=${this.title}, description=${this.description})`;
  }
}