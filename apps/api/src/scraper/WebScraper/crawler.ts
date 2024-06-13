import axios from "axios";
import cheerio, { load } from "cheerio";
import { URL } from "url";
import { getLinksFromSitemap } from "./sitemap";
import async from "async";
import { CrawlerOptions, PageOptions, Progress } from "../../lib/entities";
import { scrapSingleUrl, scrapWithScrapingBee } from "./single_url";
import robotsParser from "robots-parser";

export class WebCrawler {
  private initialUrl: string;
  private baseUrl: string;
  private includes: string[];
  private excludes: string[];
  private maxCrawledLinks: number;
  private maxCrawledDepth: number;
  private visited: Set<string> = new Set();
  private crawledUrls: Map<string, string> = new Map();
  private limit: number;
  private robotsTxtUrl: string;
  private robots: any;
  private generateImgAltText: boolean;
  private allowBackwardCrawling: boolean;

  constructor({
    initialUrl,
    includes,
    excludes,
    maxCrawledLinks = 10000,
    limit = 10000,
    generateImgAltText = false,
    maxCrawledDepth = 10,
    allowBackwardCrawling = false
  }: {
    initialUrl: string;
    includes?: string[];
    excludes?: string[];
    maxCrawledLinks?: number;
    limit?: number;
    generateImgAltText?: boolean;
    maxCrawledDepth?: number;
    allowBackwardCrawling?: boolean;
  }) {
    this.initialUrl = initialUrl;
    this.baseUrl = new URL(initialUrl).origin;
    this.includes = includes ?? [];
    this.excludes = excludes ?? [];
    this.limit = limit;
    this.robotsTxtUrl = `${this.baseUrl}/robots.txt`;
    this.robots = robotsParser(this.robotsTxtUrl, "");
    // Deprecated, use limit instead
    this.maxCrawledLinks = maxCrawledLinks ?? limit;
    this.maxCrawledDepth = maxCrawledDepth ?? 10;
    this.generateImgAltText = generateImgAltText ?? false;
    this.allowBackwardCrawling = allowBackwardCrawling ?? false;
  }

  private filterLinks(sitemapLinks: string[], limit: number, maxDepth: number): string[] {
    return sitemapLinks
      .filter((link) => {
        const url = new URL(link);
        const path = url.pathname;
        const depth = url.pathname.split('/').length - 1;

        // Check if the link exceeds the maximum depth allowed
        if (depth > maxDepth) {
          return false;
        }

        // Check if the link should be excluded
        if (this.excludes.length > 0 && this.excludes[0] !== "") {
          if (
            this.excludes.some((excludePattern) =>
              new RegExp(excludePattern).test(path)
            )
          ) {
            return false;
          }
        }

        // Check if the link matches the include patterns, if any are specified
        if (this.includes.length > 0 && this.includes[0] !== "") {
          if (!this.includes.some((includePattern) =>
            new RegExp(includePattern).test(path)
          )) {
            return false;
          }
        }

        // Normalize the initial URL and the link to account for www and non-www versions
        const normalizedInitialUrl = new URL(this.initialUrl);
        const normalizedLink = new URL(link);
        const initialHostname = normalizedInitialUrl.hostname.replace(/^www\./, '');
        const linkHostname = normalizedLink.hostname.replace(/^www\./, '');

        // Ensure the protocol and hostname match, and the path starts with the initial URL's path
        if (linkHostname !== initialHostname) {
          return false;
        }

        if (!this.allowBackwardCrawling) {
          if (!normalizedLink.pathname.startsWith(normalizedInitialUrl.pathname)) {
            return false;
          }
        }

        const isAllowed = this.robots.isAllowed(link, "FireCrawlAgent") ?? true;
        // Check if the link is disallowed by robots.txt
        if (!isAllowed) {
          console.log(`Link disallowed by robots.txt: ${link}`);
          return false;
        }

        return true;
      })
      .slice(0, limit);
  }

  public async start(
    inProgress?: (progress: Progress) => void,
    pageOptions?: PageOptions,
    crawlerOptions?: CrawlerOptions,
    concurrencyLimit: number = 5,
    limit: number = 10000,
    maxDepth: number = 10
  ): Promise<{ url: string, html: string }[]> {
    // Fetch and parse robots.txt
    try {
      const response = await axios.get(this.robotsTxtUrl);
      this.robots = robotsParser(this.robotsTxtUrl, response.data);
    } catch (error) {
      console.log(`Failed to fetch robots.txt from ${this.robotsTxtUrl}`);

    }


    if(!crawlerOptions?.ignoreSitemap){
      const sitemapLinks = await this.tryFetchSitemapLinks(this.initialUrl);
      if (sitemapLinks.length > 0) {
        let filteredLinks = this.filterLinks(sitemapLinks, limit, maxDepth);
        return filteredLinks.map(link => ({ url: link, html: "" }));
      }
    }

    const urls = await this.crawlUrls(
      [this.initialUrl],
      pageOptions,
      concurrencyLimit,
      inProgress
    );
    
    if (
      urls.length === 0 &&
      this.filterLinks([this.initialUrl], limit, this.maxCrawledDepth).length > 0
    ) {
      return [{ url: this.initialUrl, html: "" }];
    }

    // make sure to run include exclude here again
    const filteredUrls = this.filterLinks(urls.map(urlObj => urlObj.url), limit, this.maxCrawledDepth);
    return filteredUrls.map(url => ({ url, html: urls.find(urlObj => urlObj.url === url)?.html || "" }));
  }

  private async crawlUrls(
    urls: string[],
    pageOptions: PageOptions,
    concurrencyLimit: number,
    inProgress?: (progress: Progress) => void,
  ): Promise<{ url: string, html: string }[]> {
    const queue = async.queue(async (task: string, callback) => {
      if (this.crawledUrls.size >= Math.min(this.maxCrawledLinks, this.limit)) {
        if (callback && typeof callback === "function") {
          callback();
        }
        return;
      }
      const newUrls = await this.crawl(task, pageOptions);
      // add the initial url if not already added
      // if (this.visited.size === 1) {
      //   let normalizedInitial = this.initialUrl;
      //   if (!normalizedInitial.endsWith("/")) {
      //     normalizedInitial = normalizedInitial + "/";
      //   }
      //   if (!newUrls.some(page => page.url === this.initialUrl)) {
      //     newUrls.push({ url: this.initialUrl, html: "" });
      //   }
      // }


      newUrls.forEach((page) => this.crawledUrls.set(page.url, page.html));
      
      if (inProgress && newUrls.length > 0) {
        inProgress({
          current: this.crawledUrls.size,
          total: Math.min(this.maxCrawledLinks, this.limit),
          status: "SCRAPING",
          currentDocumentUrl: newUrls[newUrls.length - 1].url,
        });
      } else if (inProgress) {
        inProgress({
          current: this.crawledUrls.size,
          total: Math.min(this.maxCrawledLinks, this.limit),
          status: "SCRAPING",
          currentDocumentUrl: task,
        });
      }
      await this.crawlUrls(newUrls.map((p) => p.url), pageOptions, concurrencyLimit, inProgress);
      if (callback && typeof callback === "function") {
        callback();
      }
    }, concurrencyLimit);

    queue.push(
      urls.filter(
        (url) =>
          !this.visited.has(url) && this.robots.isAllowed(url, "FireCrawlAgent")
      ),
      (err) => {
        if (err) console.error(err);
      }
    );
    await queue.drain();
    return Array.from(this.crawledUrls.entries()).map(([url, html]) => ({ url, html }));
  }

  async crawl(url: string, pageOptions: PageOptions): Promise<{url: string, html: string}[]> {
    const normalizedUrl = this.normalizeCrawlUrl(url);
    if (this.visited.has(normalizedUrl) || !this.robots.isAllowed(url, "FireCrawlAgent")) {
      return [];
    }
    this.visited.add(normalizedUrl);

    if (!url.startsWith("http")) {
      url = "https://" + url;
    }
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }

    if (this.isFile(url) || this.isSocialMediaOrEmail(url)) {
      return [];
    }

    try {
      let content: string = "";
      // If it is the first link, fetch with single url
      if (this.visited.size === 1) {
        const page = await scrapSingleUrl(url, { ...pageOptions, includeHtml: true });
        content = page.html ?? "";
      } else {
        const response = await axios.get(url);
        content = response.data ?? "";
      }
      const $ = load(content);
      let links: { url: string, html: string }[] = [];

      // Add the initial URL to the list of links
      if (this.visited.size === 1) {
        links.push({ url, html: content });
      }

      $("a").each((_, element) => {
        const href = $(element).attr("href");
        if (href) {
          let fullUrl = href;
          if (!href.startsWith("http")) {
            fullUrl = new URL(href, this.baseUrl).toString();
          }
          const urlObj = new URL(fullUrl);
          const path = urlObj.pathname;

          if (
            this.isInternalLink(fullUrl) &&
            this.matchesPattern(fullUrl) &&
            this.noSections(fullUrl) &&
            // The idea here to comment this out is to allow wider website coverage as we filter this anyway afterwards
            // this.matchesIncludes(path) &&
            !this.matchesExcludes(path) &&
            this.robots.isAllowed(fullUrl, "FireCrawlAgent")
          ) {
            links.push({ url: fullUrl, html: content });
          }
        }
      });

      if (this.visited.size === 1) {
        return links;
      }
      // Create a new list to return to avoid modifying the visited list
      return links.filter((link) => !this.visited.has(this.normalizeCrawlUrl(link.url)));
    } catch (error) {
      return [];
    }
  }

  private normalizeCrawlUrl(url: string): string {
    try{
      const urlObj = new URL(url);
      urlObj.searchParams.sort(); // Sort query parameters to normalize
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  private matchesIncludes(url: string): boolean {
    if (this.includes.length === 0 || this.includes[0] == "") return true;
    return this.includes.some((pattern) => new RegExp(pattern).test(url));
  }

  private matchesExcludes(url: string): boolean {
    if (this.excludes.length === 0 || this.excludes[0] == "") return false;
    return this.excludes.some((pattern) => new RegExp(pattern).test(url));
  }

  private noSections(link: string): boolean {
    return !link.includes("#");
  }

  private isInternalLink(link: string): boolean {
    const urlObj = new URL(link, this.baseUrl);
    const domainWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, "");
    return urlObj.hostname === domainWithoutProtocol;
  }

  private matchesPattern(link: string): boolean {
    return true; // Placeholder for future pattern matching implementation
  }

  private isFile(url: string): boolean {
    const fileExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".css",
      ".js",
      ".ico",
      ".svg",
      // ".pdf", 
      ".zip",
      ".exe",
      ".dmg",
      ".mp4",
      ".mp3",
      ".pptx",
      // ".docx",
      ".xlsx",
      ".xml",
      ".avi",
      ".flv",
      ".woff",
      ".ttf",
      ".woff2",
      ".webp"
    ];
    return fileExtensions.some((ext) => url.endsWith(ext));
  }

  private isSocialMediaOrEmail(url: string): boolean {
    const socialMediaOrEmail = [
      "facebook.com",
      "twitter.com",
      "linkedin.com",
      "instagram.com",
      "pinterest.com",
      "mailto:",
    ];
    return socialMediaOrEmail.some((ext) => url.includes(ext));
  }

  // 
  private async tryFetchSitemapLinks(url: string): Promise<string[]> {
    const normalizeUrl = (url: string) => {
      url = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (url.endsWith("/")) {
        url = url.slice(0, -1);
      }
      return url;
    };

    const sitemapUrl = url.endsWith("/sitemap.xml")
      ? url
      : `${url}/sitemap.xml`;

    let sitemapLinks: string[] = [];

    try {
      const response = await axios.get(sitemapUrl);
      if (response.status === 200) {
        sitemapLinks = await getLinksFromSitemap(sitemapUrl);
      }
    } catch (error) {
      // Error handling for failed sitemap fetch
      // console.error(`Failed to fetch sitemap from ${sitemapUrl}: ${error}`);
    }

    if (sitemapLinks.length === 0) {
      // If the first one doesn't work, try the base URL
      const baseUrlSitemap = `${this.baseUrl}/sitemap.xml`;
      try {
        const response = await axios.get(baseUrlSitemap);
        if (response.status === 200) {
          sitemapLinks = await getLinksFromSitemap(baseUrlSitemap);
        }
      } catch (error) {
        // Error handling for failed base URL sitemap fetch
        // console.error(`Failed to fetch sitemap from ${baseUrlSitemap}: ${error}`);
      }
    }

    // Normalize and check if the URL is present in any of the sitemaps
    const normalizedUrl = normalizeUrl(url);
    const normalizedSitemapLinks = sitemapLinks.map(link => normalizeUrl(link));

    // has to be greater than 0 to avoid adding the initial URL to the sitemap links, and preventing crawler to crawl
    if (!normalizedSitemapLinks.includes(normalizedUrl) && sitemapLinks.length > 0) {
      // do not push the normalized url
      sitemapLinks.push(url);
    }

    return sitemapLinks;
  }
}
