import {
  Document,
  ExtractorOptions,
  PageOptions,
  WebScraperOptions,
} from "../../lib/entities";
import { Progress } from "../../lib/entities";
import { scrapSingleUrl } from "./single_url";
import { SitemapEntry, fetchSitemapData, getLinksFromSitemap } from "./sitemap";
import { WebCrawler } from "./crawler";
import { getValue, setValue } from "../../services/redis";
import { getImageDescription } from "./utils/imageDescription";
import { fetchAndProcessPdf } from "./utils/pdfProcessor";
import {
  replaceImgPathsWithAbsolutePaths,
  replacePathsWithAbsolutePaths,
} from "./utils/replacePaths";
import { generateCompletions } from "../../lib/LLM-extraction";
import { getWebScraperQueue } from "../../../src/services/queue-service";

export class WebScraperDataProvider {
  private bullJobId: string;
  private urls: string[] = [""];
  private mode: "single_urls" | "sitemap" | "crawl" = "single_urls";
  private includes: string[];
  private excludes: string[];
  private maxCrawledLinks: number;
  private returnOnlyUrls: boolean;
  private limit: number = 10000;
  private concurrentRequests: number = 20;
  private generateImgAltText: boolean = false;
  private pageOptions?: PageOptions;
  private extractorOptions?: ExtractorOptions;
  private replaceAllPathsWithAbsolutePaths?: boolean = false;
  private generateImgAltTextModel: "gpt-4-turbo" | "claude-3-opus" =
    "gpt-4-turbo";

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

    const results: (Document | null)[] = new Array(urls.length).fill(null);
    for (let i = 0; i < urls.length; i += this.concurrentRequests) {
      const batchUrls = urls.slice(i, i + this.concurrentRequests);
      await Promise.all(
        batchUrls.map(async (url, index) => {
          const result = await scrapSingleUrl(url, this.pageOptions);
          processedUrls++;
          if (inProgress) {
            inProgress({
              current: processedUrls,
              total: totalUrls,
              status: "SCRAPING",
              currentDocumentUrl: url,
              currentDocument: result,
            });
          }

          results[i + index] = result;
        })
      );
      try {
        if (this.mode === "crawl" && this.bullJobId) {
          const job = await getWebScraperQueue().getJob(this.bullJobId);
          const jobStatus = await job.getState();
          if (jobStatus === "failed") {
            throw new Error(
              "Job has failed or has been cancelled by the user. Stopping the job..."
            );
          }
        }
      } catch (error) {
        console.error(error);
      }
    }
    return results.filter((result) => result !== null) as Document[];
  }

  async getDocuments(
    useCaching: boolean = false,
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    this.validateInitialUrl();

    if (!useCaching) {
      return this.processDocumentsWithoutCache(inProgress);
    }

    return this.processDocumentsWithCache(inProgress);
  }

  private validateInitialUrl(): void {
    if (this.urls[0].trim() === "") {
      throw new Error("Url is required");
    }
  }

  /**
   * Process documents without cache handling each mode
   * @param inProgress inProgress
   * @returns documents
   */
  private async processDocumentsWithoutCache(
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    switch (this.mode) {
      case "crawl":
        return this.handleCrawlMode(inProgress);
      case "single_urls":
        return this.handleSingleUrlsMode(inProgress);
      case "sitemap":
        return this.handleSitemapMode(inProgress);
      default:
        return [];
    }
  }

  private async handleCrawlMode(
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    const crawler = new WebCrawler({
      initialUrl: this.urls[0],
      includes: this.includes,
      excludes: this.excludes,
      maxCrawledLinks: this.maxCrawledLinks,
      limit: this.limit,
      generateImgAltText: this.generateImgAltText,
    });
    let links = await crawler.start(inProgress, 5, this.limit);
    if (this.returnOnlyUrls) {
      return this.returnOnlyUrlsResponse(links, inProgress);
    }

    let documents = await this.processLinks(links, inProgress);
    return this.cacheAndFinalizeDocuments(documents, links);
  }

  private async handleSingleUrlsMode(
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    let documents = await this.processLinks(this.urls, inProgress);
    return documents;
  }

  private async handleSitemapMode(
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    let links = await getLinksFromSitemap(this.urls[0]);
    if (this.returnOnlyUrls) {
      return this.returnOnlyUrlsResponse(links, inProgress);
    }

    let documents = await this.processLinks(links, inProgress);
    return this.cacheAndFinalizeDocuments(documents, links);
  }

  private async returnOnlyUrlsResponse(
    links: string[],
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    inProgress?.({
      current: links.length,
      total: links.length,
      status: "COMPLETED",
      currentDocumentUrl: this.urls[0],
    });
    return links.map((url) => ({
      content: "",
      html: this.pageOptions?.includeHtml ? "" : undefined,
      markdown: "",
      metadata: { sourceURL: url },
    }));
  }

  private async processLinks(
    links: string[],
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    let pdfLinks = links.filter((link) => link.endsWith(".pdf"));
    let pdfDocuments = await this.fetchPdfDocuments(pdfLinks);
    links = links.filter((link) => !link.endsWith(".pdf"));

    let documents = await this.convertUrlsToDocuments(links, inProgress);
    documents = await this.getSitemapData(this.urls[0], documents);
    documents = this.applyPathReplacements(documents);
    documents = await this.applyImgAltText(documents);

    if (
      this.extractorOptions.mode === "llm-extraction" &&
      this.mode === "single_urls"
    ) {
      documents = await generateCompletions(documents, this.extractorOptions);
    }
    return documents.concat(pdfDocuments);
  }

  private async fetchPdfDocuments(pdfLinks: string[]): Promise<Document[]> {
    return Promise.all(
      pdfLinks.map(async (pdfLink) => {
        const pdfContent = await fetchAndProcessPdf(pdfLink);
        return {
          content: pdfContent,
          metadata: { sourceURL: pdfLink },
          provider: "web-scraper",
        };
      })
    );
  }

  private applyPathReplacements(documents: Document[]): Document[] {
    return this.replaceAllPathsWithAbsolutePaths
      ? replacePathsWithAbsolutePaths(documents)
      : replaceImgPathsWithAbsolutePaths(documents);
  }

  private async applyImgAltText(documents: Document[]): Promise<Document[]> {
    return this.generateImgAltText
      ? this.generatesImgAltText(documents)
      : documents;
  }

  private async cacheAndFinalizeDocuments(
    documents: Document[],
    links: string[]
  ): Promise<Document[]> {
    await this.setCachedDocuments(documents, links);
    documents = this.removeChildLinks(documents);
    return documents.splice(0, this.limit);
  }

  private async processDocumentsWithCache(
    inProgress?: (progress: Progress) => void
  ): Promise<Document[]> {
    let documents = await this.getCachedDocuments(
      this.urls.slice(0, this.limit)
    );
    if (documents.length < this.limit) {
      const newDocuments: Document[] = await this.getDocuments(
        false,
        inProgress
      );
      documents = this.mergeNewDocuments(documents, newDocuments);
    }
    documents = this.filterDocsExcludeInclude(documents);
    documents = this.removeChildLinks(documents);
    return documents.splice(0, this.limit);
  }

  private mergeNewDocuments(
    existingDocuments: Document[],
    newDocuments: Document[]
  ): Document[] {
    newDocuments.forEach((doc) => {
      if (
        !existingDocuments.some(
          (d) =>
            this.normalizeUrl(d.metadata.sourceURL) ===
            this.normalizeUrl(doc.metadata?.sourceURL)
        )
      ) {
        existingDocuments.push(doc);
      }
    });
    return existingDocuments;
  }

  private filterDocsExcludeInclude(documents: Document[]): Document[] {
    return documents.filter((document) => {
      const url = new URL(document.metadata.sourceURL);
      const path = url.pathname;

      if (this.excludes.length > 0 && this.excludes[0] !== "") {
        // Check if the link should be excluded
        if (
          this.excludes.some((excludePattern) =>
            new RegExp(excludePattern).test(path)
          )
        ) {
          return false;
        }
      }

      if (this.includes.length > 0 && this.includes[0] !== "") {
        // Check if the link matches the include patterns, if any are specified
        if (this.includes.length > 0) {
          return this.includes.some((includePattern) =>
            new RegExp(includePattern).test(path)
          );
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
    }
    return documents;
  }

  async setCachedDocuments(documents: Document[], childrenLinks?: string[]) {
    for (const document of documents) {
      if (document.content.trim().length === 0) {
        continue;
      }
      const normalizedUrl = this.normalizeUrl(document.metadata.sourceURL);
      await setValue(
        "web-scraper-cache:" + normalizedUrl,
        JSON.stringify({
          ...document,
          childrenLinks: childrenLinks || [],
        }),
        60 * 60 * 24 * 10
      ); // 10 days
    }
  }

  async getCachedDocuments(urls: string[]): Promise<Document[]> {
    let documents: Document[] = [];
    for (const url of urls) {
      const normalizedUrl = this.normalizeUrl(url);
      console.log(
        "Getting cached document for web-scraper-cache:" + normalizedUrl
      );
      const cachedDocumentString = await getValue(
        "web-scraper-cache:" + normalizedUrl
      );
      if (cachedDocumentString) {
        const cachedDocument = JSON.parse(cachedDocumentString);
        documents.push(cachedDocument);

        // get children documents
        for (const childUrl of cachedDocument.childrenLinks || []) {
          const normalizedChildUrl = this.normalizeUrl(childUrl);
          const childCachedDocumentString = await getValue(
            "web-scraper-cache:" + normalizedChildUrl
          );
          if (childCachedDocumentString) {
            const childCachedDocument = JSON.parse(childCachedDocumentString);
            if (
              !documents.find(
                (doc) =>
                  doc.metadata.sourceURL ===
                  childCachedDocument.metadata.sourceURL
              )
            ) {
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

    this.bullJobId = options.bullJobId;
    this.urls = options.urls;
    this.mode = options.mode;
    this.concurrentRequests = options.concurrentRequests ?? 20;
    this.includes = options.crawlerOptions?.includes ?? [];
    this.excludes = options.crawlerOptions?.excludes ?? [];
    this.maxCrawledLinks = options.crawlerOptions?.maxCrawledLinks ?? 1000;
    this.returnOnlyUrls = options.crawlerOptions?.returnOnlyUrls ?? false;
    this.limit = options.crawlerOptions?.limit ?? 10000;
    this.generateImgAltText =
      options.crawlerOptions?.generateImgAltText ?? false;
    this.pageOptions = options.pageOptions ?? { onlyMainContent: false, includeHtml: false };
    this.extractorOptions = options.extractorOptions ?? {mode: "markdown"}
    this.replaceAllPathsWithAbsolutePaths = options.crawlerOptions?.replaceAllPathsWithAbsolutePaths ?? false;
    //! @nicolas, for some reason this was being injected and breakign everything. Don't have time to find source of the issue so adding this check
    this.excludes = this.excludes.filter((item) => item !== "");

    // make sure all urls start with https://
    this.urls = this.urls.map((url) => {
      if (!url.trim().startsWith("http")) {
        return `https://${url}`;
      }
      return url;
    });
  }

  private async getSitemapData(baseUrl: string, documents: Document[]) {
    const sitemapData = await fetchSitemapData(baseUrl);
    if (sitemapData) {
      for (let i = 0; i < documents.length; i++) {
        const docInSitemapData = sitemapData.find(
          (data) =>
            this.normalizeUrl(data.loc) ===
            this.normalizeUrl(documents[i].metadata.sourceURL)
        );
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
  generatesImgAltText = async (documents: Document[]): Promise<Document[]> => {
    await Promise.all(
      documents.map(async (document) => {
        const images = document.content.match(/!\[.*?\]\((.*?)\)/g) || [];

        await Promise.all(
          images.map(async (image: string) => {
            let imageUrl = image.match(/\(([^)]+)\)/)[1];
            let altText = image.match(/\[(.*?)\]/)[1];

            if (
              !altText &&
              !imageUrl.startsWith("data:image") &&
              /\.(png|jpeg|gif|webp)$/.test(imageUrl)
            ) {
              const imageIndex = document.content.indexOf(image);
              const contentLength = document.content.length;
              let backText = document.content.substring(
                imageIndex + image.length,
                Math.min(imageIndex + image.length + 1000, contentLength)
              );
              let frontTextStartIndex = Math.max(imageIndex - 1000, 0);
              let frontText = document.content.substring(
                frontTextStartIndex,
                imageIndex
              );
              altText = await getImageDescription(
                imageUrl,
                backText,
                frontText,
                this.generateImgAltTextModel
              );
            }

            document.content = document.content.replace(
              image,
              `![${altText}](${imageUrl})`
            );
          })
        );
      })
    );

    return documents;
  };
}
