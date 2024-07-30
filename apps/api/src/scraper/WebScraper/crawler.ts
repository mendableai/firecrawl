import axios from "axios";
import cheerio, { load } from "cheerio";
import { URL } from "url";
import { getLinksFromSitemap } from "./sitemap";
import async from "async";
import { CrawlerOptions, PageOptions, Progress } from "../../lib/entities";
import { scrapSingleUrl } from "./single_url";
import robotsParser from "robots-parser";
import { getURLDepth } from "./utils/maxDepthUtils";
import { axiosTimeout } from "../../../src/lib/timeout";
import { Logger } from "../../../src/lib/logger";

export class WebCrawler {
  private jobId: string;
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
  private allowExternalContentLinks: boolean;

  constructor({
    jobId,
    initialUrl,
    includes,
    excludes,
    maxCrawledLinks = 10000,
    limit = 10000,
    generateImgAltText = false,
    maxCrawledDepth = 10,
    allowBackwardCrawling = false,
    allowExternalContentLinks = false
  }: {
    jobId: string;
    initialUrl: string;
    includes?: string[];
    excludes?: string[];
    maxCrawledLinks?: number;
    limit?: number;
    generateImgAltText?: boolean;
    maxCrawledDepth?: number;
    allowBackwardCrawling?: boolean;
    allowExternalContentLinks?: boolean;
  }) {
    this.jobId = jobId;
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
    this.allowExternalContentLinks = allowExternalContentLinks ?? false;
  }

  private filterLinks(sitemapLinks: string[], limit: number, maxDepth: number): string[] {
    return sitemapLinks
      .filter((link) => {
        const url = new URL(link.trim(), this.baseUrl);
        const path = url.pathname;
        
        const depth = getURLDepth(url.toString());

        
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
        // commented to able to handling external link on allowExternalContentLinks
        // if (linkHostname !== initialHostname) {
        //   return false;
        // }

        if (!this.allowBackwardCrawling) {
          if (!normalizedLink.pathname.startsWith(normalizedInitialUrl.pathname)) {
            return false;
          }
        }

        const isAllowed = this.robots.isAllowed(link, "FireCrawlAgent") ?? true;
        // Check if the link is disallowed by robots.txt
        if (!isAllowed) {
          Logger.debug(`Link disallowed by robots.txt: ${link}`);
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

    Logger.debug(`Crawler starting with ${this.initialUrl}`);
    // Fetch and parse robots.txt
    try {
      const response = await axios.get(this.robotsTxtUrl, { timeout: axiosTimeout });
      this.robots = robotsParser(this.robotsTxtUrl, response.data);
      Logger.debug(`Crawler robots.txt fetched with ${this.robotsTxtUrl}`);
    } catch (error) {
      Logger.debug(`Failed to fetch robots.txt from ${this.robotsTxtUrl}`);
    }

    if (!crawlerOptions?.ignoreSitemap){
      Logger.debug(`Fetching sitemap links from ${this.initialUrl}`);
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
      Logger.debug(`Crawling ${task}`);
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

    Logger.debug(`🐂 Pushing ${urls.length} URLs to the queue`);
    queue.push(
      urls.filter(
        (url) =>
          !this.visited.has(url) && this.robots.isAllowed(url, "FireCrawlAgent")
      ),
      (err) => {
        if (err) Logger.error(`🐂 Error pushing URLs to the queue: ${err}`);
      }
    );
    await queue.drain();
    Logger.debug(`🐂 Crawled ${this.crawledUrls.size} URLs, Queue drained.`);
    return Array.from(this.crawledUrls.entries()).map(([url, html]) => ({ url, html }));
  }

  async crawl(url: string, pageOptions: PageOptions): Promise<{url: string, html: string, pageStatusCode?: number, pageError?: string}[]> {
    if (this.visited.has(url) || !this.robots.isAllowed(url, "FireCrawlAgent")) {
      return [];
    }
    this.visited.add(url);

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
      let pageStatusCode: number;
      let pageError: string | undefined = undefined;

      // If it is the first link, fetch with single url
      if (this.visited.size === 1) {
        const page = await scrapSingleUrl(this.jobId, url, { ...pageOptions, includeHtml: true });
        content = page.html ?? "";
        pageStatusCode = page.metadata?.pageStatusCode;
        pageError = page.metadata?.pageError || undefined;
      } else {
        const response = await axios.get(url, { timeout: axiosTimeout });
        content = response.data ?? "";
        pageStatusCode = response.status;
        pageError = response.statusText != "OK" ? response.statusText : undefined;
      }

      const $ = load(content);
      let links: { url: string, html: string, pageStatusCode?: number, pageError?: string }[] = [];

      // Add the initial URL to the list of links
      if (this.visited.size === 1) {
        links.push({ url, html: content, pageStatusCode, pageError });
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

          if (this.isInternalLink(fullUrl)) { // INTERNAL LINKS
            if (this.isInternalLink(fullUrl) &&
              this.noSections(fullUrl) &&
              !this.matchesExcludes(path) &&
              this.isRobotsAllowed(fullUrl)
            ) {
              links.push({ url: fullUrl, html: content, pageStatusCode, pageError });
            }
          } else { // EXTERNAL LINKS
            if (
              this.isInternalLink(url) &&
              this.allowExternalContentLinks &&
              !this.isSocialMediaOrEmail(fullUrl) &&
              !this.matchesExcludes(fullUrl, true) &&
              !this.isExternalMainPage(fullUrl)
            ) {
              links.push({ url: fullUrl, html: content, pageStatusCode, pageError });
            }
          }
        }
      });
      
      if (this.visited.size === 1) {
        return links;
      }

      // Create a new list to return to avoid modifying the visited list
      return links.filter((link) => !this.visited.has(link.url));
    } catch (error) {
      return [];
    }
  }

  private isRobotsAllowed(url: string): boolean {
    return (this.robots ? (this.robots.isAllowed(url, "FireCrawlAgent") ?? true) : true)
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

  private matchesExcludes(url: string, onlyDomains: boolean = false): boolean {
    return this.excludes.some((pattern) => {
      if (onlyDomains)
        return this.matchesExcludesExternalDomains(url);

      return this.excludes.some((pattern) => new RegExp(pattern).test(url));
    });
  }

  // supported formats: "example.com/blog", "https://example.com", "blog.example.com", "example.com"
  private matchesExcludesExternalDomains(url: string) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      for (let domain of this.excludes) {
        let domainObj = new URL('http://' + domain.replace(/^https?:\/\//, ''));
        let domainHostname = domainObj.hostname;
        let domainPathname = domainObj.pathname;

        if (hostname === domainHostname || hostname.endsWith(`.${domainHostname}`)) {
          if (pathname.startsWith(domainPathname)) {
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  private isExternalMainPage(url:string):boolean {
    return !Boolean(url.split("/").slice(3).filter(subArray => subArray.length > 0).length)
  }

  private noSections(link: string): boolean {
    return !link.includes("#");
  }

  private isInternalLink(link: string): boolean {
    const urlObj = new URL(link, this.baseUrl);
    const baseDomain = this.baseUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").trim();
    const linkDomain = urlObj.hostname.replace(/^www\./, "").trim();
    
    return linkDomain === baseDomain;
  }

  public isFile(url: string): boolean {
    const fileExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".css",
      ".js",
      ".ico",
      ".svg",
      ".tiff",
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
      "github.com",
      "calendly.com",
      "discord.gg",
      "discord.com",
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
      const response = await axios.get(sitemapUrl, { timeout: axiosTimeout });
      if (response.status === 200) {
        sitemapLinks = await getLinksFromSitemap({ sitemapUrl });
      }
    } catch (error) { 
      Logger.debug(`Failed to fetch sitemap with axios from ${sitemapUrl}: ${error}`);
      const response = await getLinksFromSitemap({ sitemapUrl, mode: 'fire-engine' });
      if (response) {
        sitemapLinks = response;
      }
    }

    if (sitemapLinks.length === 0) {
      const baseUrlSitemap = `${this.baseUrl}/sitemap.xml`;
      try {
        const response = await axios.get(baseUrlSitemap, { timeout: axiosTimeout });
        if (response.status === 200) {
          sitemapLinks = await getLinksFromSitemap({ sitemapUrl: baseUrlSitemap });
        }
      } catch (error) {
        Logger.debug(`Failed to fetch sitemap from ${baseUrlSitemap}: ${error}`);
        sitemapLinks = await getLinksFromSitemap({ sitemapUrl: baseUrlSitemap, mode: 'fire-engine' });
      }
    }

    const normalizedUrl = normalizeUrl(url);
    const normalizedSitemapLinks = sitemapLinks.map(link => normalizeUrl(link));
    // has to be greater than 0 to avoid adding the initial URL to the sitemap links, and preventing crawler to crawl
    if (!normalizedSitemapLinks.includes(normalizedUrl) && sitemapLinks.length > 0) {
      sitemapLinks.push(url);
    }
    return sitemapLinks;
  }
}
