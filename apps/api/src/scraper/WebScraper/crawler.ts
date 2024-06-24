import axios from "axios";
import cheerio, { load } from "cheerio";
import { URL } from "url";
import { getLinksFromSitemap } from "./sitemap";
import async from "async";
import { CrawlerOptions, PageOptions, Progress } from "../../lib/entities";
import { scrapSingleUrl, scrapWithScrapingBee } from "./single_url";
import robotsParser from "robots-parser";
import { getURLDepth } from "./utils/maxDepthUtils";

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
      console.log('3.1 here OK')
      console.log('this.robotsTxtUrl:', this.robotsTxtUrl)
      const response = await axios.get(this.robotsTxtUrl, { timeout: 3000 });
      console.log('????', {response})
      console.log('3.2 here OK')
      this.robots = robotsParser(this.robotsTxtUrl, response.data);
    } catch (error) {
      console.log(`Failed to fetch robots.txt from ${this.robotsTxtUrl}`);

    }

    console.log('4. here OK!')
    if(!crawlerOptions?.ignoreSitemap){
      console.log('4.1')
      const sitemapLinks = await this.tryFetchSitemapLinks(this.initialUrl);
      console.log('4.2')
      if (sitemapLinks.length > 0) {
        console.log('4.3')
        let filteredLinks = this.filterLinks(sitemapLinks, limit, maxDepth);
        console.log('4.4')
        return filteredLinks.map(link => ({ url: link, html: "" }));
      }
    }

    console.log('5. here OK!')
    const urls = await this.crawlUrls(
      [this.initialUrl],
      pageOptions,
      concurrencyLimit,
      inProgress
    );
   
    console.log('6. here OK!')
    if (
      urls.length === 0 &&
      this.filterLinks([this.initialUrl], limit, this.maxCrawledDepth).length > 0
    ) {
      return [{ url: this.initialUrl, html: "" }];
    }

    // make sure to run include exclude here again
    const filteredUrls = this.filterLinks(urls.map(urlObj => urlObj.url), limit, this.maxCrawledDepth);
    console.log('7. here OK!')
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
      console.log('crawlUrls - crawl')
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

      console.log('---??---')
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
      console.log('----???----')
      await this.crawlUrls(newUrls.map((p) => p.url), pageOptions, concurrencyLimit, inProgress);
      if (callback && typeof callback === "function") {
        callback();
      }
    }, concurrencyLimit);

    console.log('crawlUrls - queue.push')
    queue.push(
      urls.filter(
        (url) =>
          !this.visited.has(url) && this.robots.isAllowed(url, "FireCrawlAgent")
      ),
      (err) => {
        if (err) console.error(err);
      }
    );
    console.log('crawlUrls - queue.drain')
    await queue.drain();
    console.log('crawlUrls - return')
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
        console.log('crawl scrapSingleUrl...')
        const page = await scrapSingleUrl(url, { ...pageOptions, includeHtml: true });
        console.log('got a page! lets continue...')
        content = page.html ?? "";
        pageStatusCode = page.metadata?.pageStatusCode;
        pageError = page.metadata?.pageError || undefined;
      } else {
        // console.log('crawl - else')
        const response = await axios.get(url, { timeout: 3000 });
        console.log('crawl - else - response ok')
        content = response.data ?? "";
        pageStatusCode = response.status;
        pageError = response.statusText != "OK" ? response.statusText : undefined;
      }

      console.log('crawl... keep going')
      const $ = load(content);
      let links: { url: string, html: string, pageStatusCode?: number, pageError?: string }[] = [];

      // Add the initial URL to the list of links
      if (this.visited.size === 1) {
        links.push({ url, html: content, pageStatusCode, pageError });
      }

      console.log('crawl... keep going 2')
      $("a").each((_, element) => {
        const href = $(element).attr("href");
        if (href) {
          console.log('href:', href)
          let fullUrl = href;
          if (!href.startsWith("http")) {
            fullUrl = new URL(href, this.baseUrl).toString();
          }
          const urlObj = new URL(fullUrl);
          console.log('urlObj:', urlObj)
          const path = urlObj.pathname;


          if (
            this.isInternalLink(fullUrl) &&
            this.noSections(fullUrl) &&
            // The idea here to comment this out is to allow wider website coverage as we filter this anyway afterwards
            // this.matchesIncludes(path) &&
            !this.matchesExcludes(path) &&
            this.isRobotsAllowed(fullUrl)
          ) {

            links.push({ url: fullUrl, html: content, pageStatusCode, pageError });
          }
        }
      });
      console.log('crawl... keep going 3')

      if (this.visited.size === 1) {
        return links;
      }

      console.log('returning crawl...')
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

  private matchesExcludes(url: string): boolean {
    if (this.excludes.length === 0 || this.excludes[0] == "") return false;
    return this.excludes.some((pattern) => new RegExp(pattern).test(url));
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
    console.log("4.1.1 - Normalizing URL");
    const normalizeUrl = (url: string) => {
      url = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (url.endsWith("/")) {
        url = url.slice(0, -1);
      }
      return url;
    };

    console.log("4.1.2 - Constructing sitemap URL");
    const sitemapUrl = url.endsWith("/sitemap.xml")
      ? url
      : `${url}/sitemap.xml`;

    let sitemapLinks: string[] = [];

    console.log("4.1.3 - Fetching sitemap from constructed URL");
    try {
      const response = await axios.get(sitemapUrl, { timeout: 3000 });
      if (response.status === 200) {
        console.log("4.1.4 - Extracting links from sitemap");
        sitemapLinks = await getLinksFromSitemap(sitemapUrl);
      }
    } catch (error) {
      console.error(`Failed to fetch sitemap from ${sitemapUrl}: ${error}`);
    }

    if (sitemapLinks.length === 0) {
      console.log("4.1.5 - Trying base URL sitemap as fallback");
      const baseUrlSitemap = `${this.baseUrl}/sitemap.xml`;
      try {
        const response = await axios.get(baseUrlSitemap, { timeout: 3000 });
        if (response.status === 200) {
          console.log("4.1.6 - Extracting links from base URL sitemap");
          sitemapLinks = await getLinksFromSitemap(baseUrlSitemap);
        }
      } catch (error) {
        console.error(`Failed to fetch sitemap from ${baseUrlSitemap}: ${error}`);
      }
    }

    console.log("4.1.7 - Normalizing sitemap links");
    const normalizedUrl = normalizeUrl(url);
    const normalizedSitemapLinks = sitemapLinks.map(link => normalizeUrl(link));

    console.log("4.1.8 - Checking if normalized URL is already included");
    if (!normalizedSitemapLinks.includes(normalizedUrl) && sitemapLinks.length > 0) {
      console.log("4.1.9 - Adding initial URL to sitemap links");
      sitemapLinks.push(url);
    }
    console.log("4.1.10 - Returning sitemap links");
    return sitemapLinks;
  }
}
