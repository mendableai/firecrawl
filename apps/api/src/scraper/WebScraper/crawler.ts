import axios, { AxiosError } from "axios";
import cheerio, { load } from "cheerio";
import { URL } from "url";
import { getLinksFromSitemap } from "./sitemap";
import async from "async";
import { CrawlerOptions, PageOptions, Progress } from "../../lib/entities";
import { scrapeSingleUrl } from "./single_url";
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
  public robots: any;
  private allowExternalLinks: boolean;

  constructor({
    jobId,
    initialUrl,
    includes,
    excludes,
    maxCrawledLinks = 10000,
    limit = 10000,
    maxCrawledDepth = 10,
    allowExternalLinks = false,
  }: {
    jobId: string;
    initialUrl: string;
    includes?: string[];
    excludes?: string[];
    maxCrawledLinks?: number;
    limit?: number;
    generateImgAltText?: boolean;
    maxCrawledDepth?: number;
    allowExternalLinks?: boolean;
  }) {
    this.jobId = jobId;
    this.initialUrl = initialUrl;
    this.baseUrl = new URL(initialUrl).origin;
    this.includes = Array.isArray(includes) ? includes : [];
    this.excludes = Array.isArray(excludes) ? excludes : [];
    this.limit = limit;
    this.robotsTxtUrl = `${this.baseUrl}/robots.txt`;
    this.robots = robotsParser(this.robotsTxtUrl, "");
    // Deprecated, use limit instead
    this.maxCrawledLinks = maxCrawledLinks ?? limit;
    this.maxCrawledDepth = maxCrawledDepth ?? 10;
    this.allowExternalLinks = allowExternalLinks ?? false;
  }

  public async getRobotsTxt(): Promise<string> {
    const response = await axios.get(this.robotsTxtUrl, {
      timeout: axiosTimeout,
    });
    return response.data;
  }

  public importRobotsTxt(txt: string) {
    this.robots = robotsParser(this.robotsTxtUrl, txt);
  }

  public async tryGetSitemap(): Promise<
    { url: string; html: string }[] | null
  > {
    Logger.debug(`Fetching sitemap links from ${this.initialUrl}`);
    const sitemapLinks = await this.tryFetchSitemapLinks(this.initialUrl);
    if (sitemapLinks.length > 0) {
      let filteredLinks = sitemapLinks
        .filter((link) => !this.visited.has(link) && this.filterURL(link))
        .slice(0, this.limit);
      return filteredLinks.map((link) => ({ url: link, html: "" }));
    }
    return null;
  }

  public async start(
    inProgress?: (progress: Progress) => void,
    pageOptions?: PageOptions,
    crawlerOptions?: CrawlerOptions,
    concurrencyLimit: number = 5,
    limit: number = 10000,
    maxDepth: number = 10
  ): Promise<{ url: string; html: string }[]> {
    Logger.debug(`Crawler starting with ${this.initialUrl}`);
    // Fetch and parse robots.txt
    try {
      const txt = await this.getRobotsTxt();
      this.importRobotsTxt(txt);
      Logger.debug(`Crawler robots.txt fetched with ${this.robotsTxtUrl}`);
    } catch (error) {
      Logger.debug(`Failed to fetch robots.txt from ${this.robotsTxtUrl}`);
    }

    if (!crawlerOptions?.ignoreSitemap) {
      const sm = await this.tryGetSitemap();
      if (sm !== null) {
        return sm;
      }
    }

    const urls = await this.crawlUrls(
      [this.initialUrl],
      pageOptions,
      concurrencyLimit,
      inProgress
    );

    const filteredUrls = urls
      .filter(
        (urlObj) => !this.visited.has(urlObj.url) && this.filterURL(urlObj.url)
      )
      .slice(0, limit);

    return filteredUrls.map((filteredUrl) => ({
      url: filteredUrl.url,
      html: urls.find((urlObj) => urlObj.url === filteredUrl.url)?.html || "",
    }));
  }

  private async crawlUrls(
    urls: string[],
    pageOptions: PageOptions,
    concurrencyLimit: number,
    inProgress?: (progress: Progress) => void
  ): Promise<{ url: string; html: string }[]> {
    const queue = async.queue(async (task: string, callback) => {
      Logger.debug(`Crawling ${task}`);
      if (this.crawledUrls.size >= Math.min(this.maxCrawledLinks, this.limit)) {
        if (callback && typeof callback === "function") {
          callback();
        }
        return;
      }
      const newUrls = await this.crawl(task, pageOptions);

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
      await this.crawlUrls(
        newUrls.map((p) => p.url),
        pageOptions,
        concurrencyLimit,
        inProgress
      );
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
    return Array.from(this.crawledUrls.entries()).map(([url, html]) => ({
      url,
      html,
    }));
  }

  public filterURL(href: string): string | null {
    let fullUrl = href;
    let urlObj: URL;
    try {
      urlObj = new URL(fullUrl);
    } catch (_) {
      return null;
    }

    if (fullUrl.includes("#")) return null;
    if (this.isFile(fullUrl)) return null;

    // INTERNAL LINKS
    if (
      this.isInternalLink(fullUrl) &&
      !this.matchesExcludes(fullUrl) &&
      this.matchesIncludes(fullUrl)
    ) {
      return fullUrl;
    }
    // EXTERNAL LINKS
    else if (
      this.allowExternalLinks &&
      !this.isSocialMediaOrEmail(fullUrl) &&
      !this.matchesExcludes(fullUrl) &&
      this.matchesIncludes(fullUrl)
    ) {
      return fullUrl;
    }

    Logger.debug(
      `Link filtered out: ${fullUrl} with tests: isInternalLink: ${this.isInternalLink(
        fullUrl
      )}, allowExternalLinks: ${
        this.allowExternalLinks
      }, isSocialMediaOrEmail: ${this.isSocialMediaOrEmail(
        fullUrl
      )}, matchesExcludes: ${this.matchesExcludes(
        fullUrl
      )}, matchesIncludes: ${this.matchesIncludes(fullUrl)}`
    );
    return null;
  }

  public extractLinksFromHTML(html: string, pageUrl: string) {
    let links: string[] = [];

    const $ = load(html || "");
    $("a").each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        let u = href;
        if (href.startsWith("/")) {
          u = new URL(href, pageUrl).href;
        } else if (!href.startsWith("#") && !href.startsWith("mailto:")) {
          u = new URL(href, pageUrl).href;
        }

        if (this.filterURL(u)) {
          links.push(u);
        }
      }
    });

    const dedupedLinks = [...new Set(links)];

    Logger.debug(`WebCrawler extracted ${dedupedLinks.length} links from HTML`);

    return dedupedLinks;
  }

  async crawl(
    url: string,
    pageOptions: PageOptions
  ): Promise<
    { url: string; html: string; pageStatusCode?: number; pageError?: string }[]
  > {
    if (
      this.visited.has(url) ||
      !this.robots.isAllowed(url, "FireCrawlAgent")
    ) {
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
      let rawHtml: string = "";
      let pageStatusCode: number;
      let pageError: string | undefined = undefined;

      // If it is the first link, fetch with single url
      if (this.visited.size === 1) {
        Logger.debug(`Scraping single URL: ${url}`);
        const page = await scrapeSingleUrl(this.jobId, url, {
          ...pageOptions,
          includeHtml: true,
          includeRawHtml: true,
        });
        rawHtml = page.rawHtml ?? "";
        pageStatusCode = page.metadata?.pageStatusCode;
        pageError = page.metadata?.pageError || undefined;
      } else {
        Logger.debug(`Axios getting URL: ${url}`);
        const response = await axios.get(url, { timeout: axiosTimeout });
        rawHtml = response.data ?? "";
        pageStatusCode = response.status;
        pageError =
          response.statusText != "OK" ? response.statusText : undefined;
      }

      const $ = load(rawHtml);
      let links: {
        url: string;
        html: string;
        pageStatusCode?: number;
        pageError?: string;
      }[] = [];

      // Add the initial URL to the list of links
      if (this.visited.size === 1) {
        links.push({ url, html: rawHtml, pageStatusCode, pageError });
      }

      links.push(
        ...this.extractLinksFromHTML(rawHtml, url).map((url) => ({
          url,
          html: rawHtml,
          pageStatusCode,
          pageError,
        }))
      );

      const resLinks =
        this.visited.size === 1
          ? links
          : links.filter((link) => !this.visited.has(link.url));

      Logger.debug(`Crawled ${url} and found ${resLinks.length} links`);

      return resLinks;
    } catch (error) {
      return [];
    }
  }

  private matchesExcludes(url: string): boolean {
    return this.excludes.some((pattern) => new RegExp(pattern).test(url));
  }

  private matchesIncludes(url: string): boolean {
    if (this.includes.length === 0) {
      return true;
    }

    return this.includes.some((pattern) => new RegExp(pattern).test(url));
  }

  private isInternalLink(link: string): boolean {
    const urlObj = new URL(link, this.baseUrl);
    const baseDomain = this.baseUrl
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .trim();
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
      ".pdf",
      ".zip",
      ".exe",
      ".dmg",
      ".mp4",
      ".mp3",
      ".pptx",
      ".docx",
      ".xlsx",
      ".xml",
      ".avi",
      ".flv",
      ".woff",
      ".ttf",
      ".woff2",
      ".webp",
      ".inc",
      ".xml",
    ];
    return fileExtensions.some((ext) => url.toLowerCase().endsWith(ext));
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
      "x.com",
      "youtube.com",
      "tiktok.com",
      "tel:",
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
      Logger.debug(
        `Failed to fetch sitemap with axios from ${sitemapUrl}: ${error}`
      );
      if (error instanceof AxiosError && error.response?.status === 404) {
        // ignore 404
      } else {
        const response = await getLinksFromSitemap({
          sitemapUrl,
          mode: "fire-engine",
        });
        if (response) {
          sitemapLinks = response;
        }
      }
    }

    if (sitemapLinks.length === 0) {
      const baseUrlSitemap = `${this.baseUrl}/sitemap.xml`;
      try {
        const response = await axios.get(baseUrlSitemap, {
          timeout: axiosTimeout,
        });
        if (response.status === 200) {
          sitemapLinks = await getLinksFromSitemap({
            sitemapUrl: baseUrlSitemap,
            mode: "fire-engine",
          });
        }
      } catch (error) {
        Logger.debug(
          `Failed to fetch sitemap from ${baseUrlSitemap}: ${error}`
        );
        if (error instanceof AxiosError && error.response?.status === 404) {
          // ignore 404
        } else {
          sitemapLinks = await getLinksFromSitemap({
            sitemapUrl: baseUrlSitemap,
            mode: "fire-engine",
          });
        }
      }
    }

    const normalizedUrl = normalizeUrl(url);
    const normalizedSitemapLinks = sitemapLinks.map((link) =>
      normalizeUrl(link)
    );
    // has to be greater than 0 to avoid adding the initial URL to the sitemap links, and preventing crawler to crawl
    if (
      !normalizedSitemapLinks.includes(normalizedUrl) &&
      sitemapLinks.length > 0
    ) {
      sitemapLinks.push(url);
    }
    return sitemapLinks;
  }
}
