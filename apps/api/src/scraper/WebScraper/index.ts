import { Document, PageOptions, WebScraperOptions } from "../../lib/entities";
import { Progress } from "../../lib/entities";
import { scrapSingleUrl } from "./single_url";
import { SitemapEntry, fetchSitemapData, getLinksFromSitemap } from "./sitemap";
import { WebCrawler } from "./crawler";
import { getValue, setValue } from "../../services/redis";
import { getImageDescription } from "./utils/imageDescription";
import { fetchAndProcessPdf } from "./utils/pdfProcessor";
import { replaceImgPathsWithAbsolutePaths, replacePathsWithAbsolutePaths } from "./utils/replacePaths";
import { batchProcess } from "../../lib/batch-process";

export class WebScraperDataProvider {
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
  private replaceAllPathsWithAbsolutePaths?: boolean = false;
  private generateImgAltTextModel: "gpt-4-turbo" | "claude-3-opus" = "gpt-4-turbo";

  authorize(): void {
    throw new Error("Method not implemented.");
  }

  authorizeNango(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  // private async convertUrlsToDocuments(
  //   urls: string[],
  //   inProgress?: (progress: Progress) => void
  // ): Promise<Document[]> {
  //   const totalUrls = urls.length;
  //   let processedUrls = 0;
  //   console.log("Converting urls to documents");
  //   console.log("Total urls", urls);
  //   const results: (Document | null)[] = new Array(urls.length).fill(null);
  //   for (let i = 0; i < urls.length; i += this.concurrentRequests) {
  //     const batchUrls = urls.slice(i, i + this.concurrentRequests);
  //     await Promise.all(
  //       batchUrls.map(async (url, index) => {
  //         const result = await scrapSingleUrl(url, true, this.pageOptions);
  //         processedUrls++;
  //         if (inProgress) {
  //           inProgress({
  //             current: processedUrls,
  //             total: totalUrls,
  //             status: "SCRAPING",
  //             currentDocumentUrl: url,
  //           });
  //         }
  //         results[i + index] = result;
  //       })
  //     );
  //   }
  //   return results.filter((result) => result !== null) as Document[];
  // }

  async getDocuments(
    useCaching: boolean = false,
    timeoutTime?: number,
    inProgress?: (progress: Progress) => void,
  ): Promise<Document[]> {
    if (timeoutTime && new Date().getTime() > timeoutTime) {
      return [];
    }
    
    if (this.urls[0].trim() === "") {
      throw new Error("Url is required");
    }

    if (true) {//!useCaching) {
      const sitemapData = await fetchSitemapData(this.urls[0]);
  
      let urls = [];
      if (this.mode === "crawl") {
        const crawler = new WebCrawler({
          initialUrl: this.urls[0],
          includes: this.includes,
          excludes: this.excludes,
          maxCrawledLinks: this.maxCrawledLinks,
          limit: this.limit,
          generateImgAltText: this.generateImgAltText,
        });
        urls = await crawler.start(inProgress, 5, this.limit);
      } else if (this.mode === "sitemap") {
        urls = await getLinksFromSitemap(this.urls[0]);
      } else if (this.mode === "single_urls") {
        urls = this.urls;
      }
  
      if (this.returnOnlyUrls) {
        if (inProgress) {
          inProgress({
            current: urls.length,
            total: urls.length,
            status: "COMPLETED",
            currentDocumentUrl: this.urls[0],
          });
        }
        return urls.map((url) => ({
          content: "",
          markdown: "",
          metadata: { sourceURL: url },
        }));
      }

      let processedDocuments: Document[] = [];
      let timeoutReached = false;

      const updateProgress = (document: Document | null, url: string) => {
        if (document) {
          processedDocuments.push(document);
        }
        if (inProgress) {
          inProgress({
            current: processedDocuments.length,
            total: urls.length,
            status: timeoutReached ? "TIMEOUT" : "SCRAPING",
            currentDocumentUrl: url,
            partialDocs: processedDocuments,
          });
        }
      };

      console.log("Timeout time: ", timeoutTime - new Date().getTime());

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          timeoutReached = true; // Mark that timeout has been reached
          reject(new Error("Timeout exceeded"));
        }, timeoutTime - new Date().getTime());
      });

      const documentPromises = urls.map(async (url) => {
        if (timeoutReached) return; // Early exit from function if timeout has been reached
        try {
          let document: Document;
          if (url.endsWith(".pdf")) {
            const pdfContent = await fetchAndProcessPdf(url);
            document = {
              content: pdfContent,
              metadata: { sourceURL: url },
              provider: "web-scraper"
            };
          } else {
            document = await scrapSingleUrl(url, true, this.pageOptions);
            if(timeoutReached) 
            {
              console.log("Timeout reached, skipping document processing for URL:", url);
              return;} // Only update progress if timeout hasn't been reached
        

            if (this.replaceAllPathsWithAbsolutePaths) {
              document = replacePathsWithAbsolutePaths(document);
            } else {
              document = replaceImgPathsWithAbsolutePaths(document);
            }

            if (this.generateImgAltText) {
              document = await this.generatesImgAltText(document);
            }

            await this.setSitemapData(sitemapData, document);
            this.setCachedDocument(document);
            if (document?.childrenLinks) delete document.childrenLinks;
          }
          
          updateProgress(document, url);
        } catch (error) {
          console.error("Error processing URL:", url, error);
          updateProgress(null, url);
          if (!timeoutReached) throw error; // Only throw if timeout hasn't been reached
        }
      });

      try {
        await Promise.race([
          batchProcess(urls, 5, async (url, index) => {
            if (timeoutReached) return;
            
          }),
          timeoutPromise
        ]);
      } catch (error) {
        if (!timeoutReached) { // Only throw if timeout hasn't been reached
          throw error;
        }
      }

      return processedDocuments.splice(0, this.limit);
    }

    let documents = await this.getCachedDocuments(
      this.urls.slice(0, this.limit)
    );
    if (documents.length < this.limit) {
      const newDocuments: Document[] = await this.getDocuments(
        false,
        timeoutTime,
        inProgress
      );
      newDocuments.forEach((doc) => {
        if (
          !documents.some(
            (d) =>
              this.normalizeUrl(d.metadata.sourceURL) ===
              this.normalizeUrl(doc.metadata?.sourceURL)
          )
        ) {
          if (doc?.childrenLinks) delete doc.childrenLinks;
          documents.push(doc);
        }
      });
    }
    documents = this.filterDocsExcludeInclude(documents);
    return documents.splice(0, this.limit);
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

  private setCachedDocument(document: Document): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.content.trim().length === 0) {
        resolve();
        return;
      }
      const normalizedUrl = this.normalizeUrl(document.metadata.sourceURL);
      setValue(
        "web-scraper-cache:" + normalizedUrl,
        JSON.stringify(document),
        60 * 60 * 24 * 10 // 10 days
      ).then(resolve).catch(reject);
    });
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
        for (const childUrl of cachedDocument.childrenLinks) {
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
    this.pageOptions = options.pageOptions ?? {onlyMainContent: false};
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

  private async setSitemapData(sitemapData: SitemapEntry[], document: Document): Promise<void> {
    if (sitemapData) {
      const docInSitemapData = sitemapData.find(
        (data) =>
          this.normalizeUrl(data.loc) ===
          this.normalizeUrl(document.metadata.sourceURL)
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
        if (Object.keys(sitemapDocData).length > 0) {
          document.metadata.sitemap = sitemapDocData;
        }
      }
    }
  }

  generatesImgAltText = async (document: Document): Promise<Document> => {
    const images = document.content.match(/!\[.*?\]\((.*?)\)/g) || [];

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
          frontText
        , this.generateImgAltTextModel);
      }

      document.content = document.content.replace(
        image,
        `![${altText}](${imageUrl})`
      );
    })

    return document;
  };

  // old method... does this make sense?
  // private cacheDocuments = async (urls: string[], documents: Document[]) => {
  //   // - parent document
  //   const cachedParentDocumentString = await getValue(
  //     "web-scraper-cache:" + this.normalizeUrl(urls[0])
  //   );
  //   if (cachedParentDocumentString != null) {
  //     let cachedParentDocument = JSON.parse(cachedParentDocumentString);
  //     if (
  //       !cachedParentDocument.childrenLinks ||
  //       cachedParentDocument.childrenLinks.length < urls.length - 1
  //     ) {
  //       cachedParentDocument.childrenLinks = urls.filter(
  //         (link) => link !== urls[0]
  //       );
  //       await setValue(
  //         "web-scraper-cache:" + this.normalizeUrl(urls[0]),
  //         JSON.stringify(cachedParentDocument),
  //         60 * 60 * 24 * 10
  //       ); // 10 days
  //     }
  //   } else {
  //     let parentDocument = documents.filter(
  //       (document) =>
  //         this.normalizeUrl(document.metadata.sourceURL) ===
  //         this.normalizeUrl(urls[0])
  //     );
  //     await this.setCachedDocuments(parentDocument, urls);
  //   }

  //   await this.setCachedDocuments(
  //     documents.filter(
  //       (document) =>
  //         this.normalizeUrl(document.metadata.sourceURL) !==
  //         this.normalizeUrl(urls[0])
  //     ),[]
  //   );
  // }
}
