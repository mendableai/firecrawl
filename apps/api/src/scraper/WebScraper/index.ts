import { Document } from "../../lib/entities";
import { Progress } from "../../lib/entities";
import { scrapSingleUrl } from "./single_url";
import { SitemapEntry, fetchSitemapData, getLinksFromSitemap } from "./sitemap";
import { WebCrawler } from "./crawler";
import { getValue, setValue } from "../../services/redis";

export type WebScraperOptions = {
  urls: string[];
  mode: "single_urls" | "sitemap" | "crawl";
  crawlerOptions?: {
    returnOnlyUrls?: boolean;
    includes?: string[];
    excludes?: string[];
    maxCrawledLinks?: number;
    limit?: number;

  };
  concurrentRequests?: number;
};
export class WebScraperDataProvider {
  private urls: string[] = [""];
  private mode: "single_urls" | "sitemap" | "crawl" = "single_urls";
  private includes: string[];
  private excludes: string[];
  private maxCrawledLinks: number;
  private returnOnlyUrls: boolean;
  private limit: number = 10000;
  private concurrentRequests: number = 20;

  authorize(): void {
    throw new Error("Method not implemented.");
  }

  authorizeNango(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  private async convertUrlsToDocuments(
    urls: string[],
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    const totalUrls = urls.length;
    let processedUrls = 0;
    console.log("Converting urls to documents");
    console.log("Total urls", urls);
    const results: (Document | null)[] = new Array(urls.length).fill(null);
    for (let i = 0; i < urls.length; i += this.concurrentRequests) {
      const batchUrls = urls.slice(i, i + this.concurrentRequests);
      await Promise.all(batchUrls.map(async (url, index) => {
        const result = await scrapSingleUrl(url, true);
        processedUrls++;
        if (inProgress) {
          inProgress({
            current: processedUrls,
            total: totalUrls,
            status: "SCRAPING",
            currentDocumentUrl: url,
          });
        }
        results[i + index] = result;
      }));
    }
    return results.filter((result) => result !== null) as Document[];
  }

  async getDocuments(
    useCaching: boolean = false,
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    if (this.urls[0].trim() === "") {
      throw new Error("Url is required");
    }

    if (!useCaching) {
      if (this.mode === "crawl") {
        const crawler = new WebCrawler({
          initialUrl: this.urls[0],
          includes: this.includes,
          excludes: this.excludes,
          maxCrawledLinks: this.maxCrawledLinks,
          limit: this.limit,
        });
        const links = await crawler.start(inProgress, 5, this.limit);
        if (this.returnOnlyUrls) {
          return links.map((url) => ({
            content: "",
            metadata: { sourceURL: url },
            provider: "web",
            type: "text",
          }));
        }
        let documents = await this.convertUrlsToDocuments(links, inProgress);
        documents = await this.getSitemapData(this.urls[0], documents);
        console.log("documents", documents)

        // CACHING DOCUMENTS
        // - parent document
        const cachedParentDocumentString = await getValue('web-scraper-cache:' + this.normalizeUrl(this.urls[0]));
        if (cachedParentDocumentString != null) {
          let cachedParentDocument = JSON.parse(cachedParentDocumentString);
          if (!cachedParentDocument.childrenLinks || cachedParentDocument.childrenLinks.length < links.length - 1) {
            cachedParentDocument.childrenLinks = links.filter((link) => link !== this.urls[0]);
            await setValue('web-scraper-cache:' + this.normalizeUrl(this.urls[0]), JSON.stringify(cachedParentDocument), 60 * 60 * 24 * 10); // 10 days
          }
        } else {
          let parentDocument = documents.filter((document) => this.normalizeUrl(document.metadata.sourceURL) === this.normalizeUrl(this.urls[0]))
          await this.setCachedDocuments(parentDocument, links);
        }

        await this.setCachedDocuments(documents.filter((document) => this.normalizeUrl(document.metadata.sourceURL) !== this.normalizeUrl(this.urls[0])), []);
        documents = this.removeChildLinks(documents);
        documents = documents.splice(0, this.limit);
        return documents;
      }

      if (this.mode === "single_urls") {
        let documents = await this.convertUrlsToDocuments(this.urls, inProgress);
        
        const baseUrl = new URL(this.urls[0]).origin;
        documents = await this.getSitemapData(baseUrl, documents);
        
        await this.setCachedDocuments(documents);
        documents = this.removeChildLinks(documents);
        documents = documents.splice(0, this.limit);
        return documents;
      }
      if (this.mode === "sitemap") {
        const links = await getLinksFromSitemap(this.urls[0]);
        let documents = await this.convertUrlsToDocuments(links.slice(0, this.limit), inProgress);

        documents = await this.getSitemapData(this.urls[0], documents);
        
        await this.setCachedDocuments(documents);
        documents = this.removeChildLinks(documents);
        documents = documents.splice(0, this.limit);
        return documents;
      }

      return [];
    }

    let documents = await this.getCachedDocuments(this.urls.slice(0, this.limit));
    if (documents.length < this.limit) {
       const newDocuments: Document[] = await this.getDocuments(false, inProgress);
      newDocuments.forEach(doc => {
        if (!documents.some(d => this.normalizeUrl(d.metadata.sourceURL) === this.normalizeUrl(doc.metadata?.sourceURL))) {
          documents.push(doc);
        }
      });
    }
    documents = this.filterDocsExcludeInclude(documents);
    documents = this.removeChildLinks(documents);
    documents = documents.splice(0, this.limit);
    return documents;
  }

  private filterDocsExcludeInclude(documents: Document[]): Document[] {
    return documents.filter((document) => {
      const url = new URL(document.metadata.sourceURL);
      const path = url.pathname;

      if (this.excludes.length > 0 && this.excludes[0] !== '') {
        // Check if the link should be excluded
        if (this.excludes.some(excludePattern => new RegExp(excludePattern).test(path))) {
          return false;
        }
      }
      
      if (this.includes.length > 0 && this.includes[0] !== '') {
        // Check if the link matches the include patterns, if any are specified
        if (this.includes.length > 0) {
          return this.includes.some(includePattern => new RegExp(includePattern).test(path));
        }
      }
      return true;
    });
  }

  private normalizeUrl(url: string): string {
    if (url.includes("//www.")) {
      return url.replace("//www.", "//");
    }
    return url;
  }

  private removeChildLinks(documents: Document[]): Document[] {
    for (let document of documents) {
      if (document?.childrenLinks) delete document.childrenLinks;
    };
    return documents;
  }

  async setCachedDocuments(documents: Document[], childrenLinks?: string[]) {
    for (const document of documents) {
      if (document.content.trim().length === 0) {
        continue;
      }
      const normalizedUrl = this.normalizeUrl(document.metadata.sourceURL);
      await setValue('web-scraper-cache:' + normalizedUrl, JSON.stringify({
        ...document,
        childrenLinks: childrenLinks || []
      }), 60 * 60 * 24 * 10); // 10 days
    }
  }

  async getCachedDocuments(urls: string[]): Promise<Document[]> {
    let documents: Document[] = [];
    for (const url of urls) {
      const normalizedUrl = this.normalizeUrl(url);
      console.log("Getting cached document for web-scraper-cache:" + normalizedUrl)
      const cachedDocumentString = await getValue('web-scraper-cache:' + normalizedUrl);
      if (cachedDocumentString) {
        const cachedDocument = JSON.parse(cachedDocumentString);
        documents.push(cachedDocument);

        // get children documents
        for (const childUrl of cachedDocument.childrenLinks) {
          const normalizedChildUrl = this.normalizeUrl(childUrl);
          const childCachedDocumentString = await getValue('web-scraper-cache:' + normalizedChildUrl);
          if (childCachedDocumentString) {
            const childCachedDocument = JSON.parse(childCachedDocumentString);
            if (!documents.find((doc) => doc.metadata.sourceURL === childCachedDocument.metadata.sourceURL)) {
              documents.push(childCachedDocument);
            }
          }
        }
      }
    }
    return documents;
  }

  setOptions(options: WebScraperOptions): void {
    if (!options.urls) {
      throw new Error("Urls are required");
    }

    console.log("options", options.crawlerOptions?.excludes)
    this.urls = options.urls;
    this.mode = options.mode;
    this.concurrentRequests = options.concurrentRequests ?? 20;
    this.includes = options.crawlerOptions?.includes ?? [];
    this.excludes = options.crawlerOptions?.excludes ?? [];
    this.maxCrawledLinks = options.crawlerOptions?.maxCrawledLinks ?? 1000;
    this.returnOnlyUrls = options.crawlerOptions?.returnOnlyUrls ?? false;
    this.limit = options.crawlerOptions?.limit ?? 10000;


    //! @nicolas, for some reason this was being injected and breakign everything. Don't have time to find source of the issue so adding this check
    this.excludes = this.excludes.filter(item => item !== '');
  
  
    // make sure all urls start with https://
    this.urls = this.urls.map((url) => {
      if (!url.trim().startsWith("http")) {
        return `https://${url}`;
      }
      return url;
    });
  }

  private async getSitemapData(baseUrl: string, documents: Document[]) {
    const sitemapData = await fetchSitemapData(baseUrl)
    if (sitemapData) {
      for (let i = 0; i < documents.length; i++) {
        const docInSitemapData = sitemapData.find((data) => this.normalizeUrl(data.loc) === this.normalizeUrl(documents[i].metadata.sourceURL))
        if (docInSitemapData) {
          let sitemapDocData: Partial<SitemapEntry> = {};
          if (docInSitemapData.changefreq) {
            sitemapDocData.changefreq = docInSitemapData.changefreq;
          }
          if (docInSitemapData.priority) {
            sitemapDocData.priority = Number(docInSitemapData.priority);
          }
          if (docInSitemapData.lastmod) {
            sitemapDocData.lastmod = docInSitemapData.lastmod;
          }
          if (Object.keys(sitemapDocData).length !== 0) {
            documents[i].metadata.sitemap = sitemapDocData;
          }
        }
      }
    }
    return documents;
  }
}

