import axios from "axios";
import cheerio, { load } from "cheerio";
import { URL } from "url";
import { getLinksFromSitemap } from "./sitemap";
import async from "async";
import { Progress } from "../../lib/entities";
import { scrapWithScrapingBee } from "./single_url";
import robotsParser from "robots-parser";

export class WebCrawler {
  private initialUrl: string;
  private baseUrl: string;
  private includes: string[];
  private excludes: string[];
  private maxCrawledLinks: number;
  private visited: Set<string> = new Set();
  private crawledUrls: Set<string> = new Set();
  private limit: number;
  private robotsTxtUrl: string;
  private robots: any;
  private generateImgAltText: boolean;

  constructor({
    initialUrl,
    includes,
    excludes,
    maxCrawledLinks,
    limit = 10000,
    generateImgAltText = false,
  }: {
    initialUrl: string;
    includes?: string[];
    excludes?: string[];
    maxCrawledLinks?: number;
    limit?: number;
    generateImgAltText?: boolean;
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
    this.generateImgAltText = generateImgAltText ?? false;
  }


  private filterLinks(sitemapLinks: string[], limit: number): string[] {
    return sitemapLinks
      .filter((link) => {
        const url = new URL(link);
        const path = url.pathname;

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
          return this.includes.some((includePattern) =>
            new RegExp(includePattern).test(path)
          );
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
    concurrencyLimit: number = 5,
    limit: number = 10000
  ): Promise<string[]> {
    // Fetch and parse robots.txt
    try {
      const response = await axios.get(this.robotsTxtUrl);
      this.robots = robotsParser(this.robotsTxtUrl, response.data);
    } catch (error) {
      console.error(`Failed to fetch robots.txt from ${this.robotsTxtUrl}`);
    }

    const sitemapLinks = await this.tryFetchSitemapLinks(this.initialUrl);
    if (sitemapLinks.length > 0) {
      const filteredLinks = this.filterLinks(sitemapLinks, limit);
      return filteredLinks;
    }

    const urls = await this.crawlUrls(
      [this.initialUrl],
      concurrencyLimit,
      inProgress
    );
    if (
      urls.length === 0 &&
      this.filterLinks([this.initialUrl], limit).length > 0
    ) {
      return [this.initialUrl];
    }

    // make sure to run include exclude here again
    return this.filterLinks(urls, limit);
  }

  private async crawlUrls(
    urls: string[],
    concurrencyLimit: number,
    inProgress?: (progress: Progress) => void
  ): Promise<string[]> {
    const queue = async.queue(async (task: string, callback) => {
      if (this.crawledUrls.size >= this.maxCrawledLinks) {
        if (callback && typeof callback === "function") {
          callback();
        }
        return;
      }
      const newUrls = await this.crawl(task);
      newUrls.forEach((url) => this.crawledUrls.add(url));
      if (inProgress && newUrls.length > 0) {
        inProgress({
          current: this.crawledUrls.size,
          total: this.maxCrawledLinks,
          status: "SCRAPING",
          currentDocumentUrl: newUrls[newUrls.length - 1],
        });
      } else if (inProgress) {
        inProgress({
          current: this.crawledUrls.size,
          total: this.maxCrawledLinks,
          status: "SCRAPING",
          currentDocumentUrl: task,
        });
      }
      await this.crawlUrls(newUrls, concurrencyLimit, inProgress);
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
    return Array.from(this.crawledUrls);
  }

  async crawl(url: string): Promise<string[]> {
    if (this.visited.has(url) || !this.robots.isAllowed(url, "FireCrawlAgent"))
      return [];
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
      let content;
      // If it is the first link, fetch with scrapingbee
      if (this.visited.size === 1) {
        content = await scrapWithScrapingBee(url, "load");
      } else {
        const response = await axios.get(url);
        content = response.data;
      }
      const $ = load(content);
      let links: string[] = [];

      $("a").each((_, element) => {
        const href = $(element).attr("href");
        if (href) {
          let fullUrl = href;
          if (!href.startsWith("http")) {
            fullUrl = new URL(href, this.baseUrl).toString();
          }
          const url = new URL(fullUrl);
          const path = url.pathname;

          if (
            // fullUrl.startsWith(this.initialUrl) && // this condition makes it stop crawling back the url
            this.isInternalLink(fullUrl) &&
            this.matchesPattern(fullUrl) &&
            this.noSections(fullUrl) &&
            this.matchesIncludes(path) &&
            !this.matchesExcludes(path) &&
            this.robots.isAllowed(fullUrl, "FireCrawlAgent")
          ) {
            links.push(fullUrl);
          }
        }
      });

      return links.filter((link) => !this.visited.has(link));
    } catch (error) {
      return [];
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
      ".docx",
      ".xlsx",
      ".xml",
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

  private async tryFetchSitemapLinks(url: string): Promise<string[]> {
    const sitemapUrl = url.endsWith("/sitemap.xml")
      ? url
      : `${url}/sitemap.xml`;
    try {
      const response = await axios.get(sitemapUrl);
      if (response.status === 200) {
        return await getLinksFromSitemap(sitemapUrl);
      }
    } catch (error) {
      // Error handling for failed sitemap fetch
    }
    return [];
  }
}
