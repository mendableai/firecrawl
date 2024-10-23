import * as cheerio from "cheerio";
import { extractMetadata } from "./utils/metadata";
import dotenv from "dotenv";
import {
  Document,
  PageOptions,
  FireEngineResponse,
  ExtractorOptions,
} from "../../lib/entities";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { urlSpecificParams } from "./utils/custom/website_params";
import { handleCustomScraping } from "./custom/handleCustomScraping";
import { removeUnwantedElements } from "./utils/removeUnwantedElements";
import { scrapeWithFetch } from "./scrapers/fetch";
import { scrapWithFireEngine } from "./scrapers/fireEngine";
import { scrapWithPlaywright } from "./scrapers/playwright";
import { scrapWithScrapingBee } from "./scrapers/scrapingBee";
import { extractLinks } from "./utils/utils";
import { Logger } from "../../lib/logger";
import { clientSideError } from "../../strings";

dotenv.config();

const useScrapingBee =
  process.env.SCRAPING_BEE_API_KEY !== "" &&
  process.env.SCRAPING_BEE_API_KEY !== undefined;
const useFireEngine =
  process.env.FIRE_ENGINE_BETA_URL !== "" &&
  process.env.FIRE_ENGINE_BETA_URL !== undefined;

export const baseScrapers = [
  useFireEngine ? "fire-engine;chrome-cdp" : undefined,
  useScrapingBee ? "scrapingBee" : undefined,
  useFireEngine ? "fire-engine" : undefined,
  useFireEngine ? undefined : "playwright",
  useScrapingBee ? "scrapingBeeLoad" : undefined,
  "fetch",
].filter(Boolean);

export async function generateRequestParams(
  url: string,
  wait_browser: string = "domcontentloaded",
  timeout: number = 15000
): Promise<any> {
  const defaultParams = {
    url: url,
    params: { timeout: timeout, wait_browser: wait_browser },
    headers: { "ScrapingService-Request": "TRUE" },
  };

  try {
    const urlKey = new URL(url).hostname.replace(/^www\./, "");
    if (urlSpecificParams.hasOwnProperty(urlKey)) {
      return { ...defaultParams, ...urlSpecificParams[urlKey] };
    } else {
      return defaultParams;
    }
  } catch (error) {
    Logger.error(`Error generating URL key: ${error}`);
    return defaultParams;
  }
}

/**
 * Get the order of scrapers to be used for scraping a URL
 * If the user doesn't have envs set for a specific scraper, it will be removed from the order.
 * @param defaultScraper The default scraper to use if the URL does not have a specific scraper order defined
 * @returns The order of scrapers to be used for scraping a URL
 */
function getScrapingFallbackOrder(
  defaultScraper?: string,
  isWaitPresent: boolean = false,
  isScreenshotPresent: boolean = false,
  isHeadersPresent: boolean = false
) {
  const availableScrapers = baseScrapers.filter((scraper) => {
    switch (scraper) {
      case "scrapingBee":
      case "scrapingBeeLoad":
        return !!process.env.SCRAPING_BEE_API_KEY;
      case "fire-engine":
        return !!process.env.FIRE_ENGINE_BETA_URL;
      case "fire-engine;chrome-cdp":
        return !!process.env.FIRE_ENGINE_BETA_URL;
      case "playwright":
        return !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      default:
        return true;
    }
  });

  let defaultOrder = [
    useFireEngine ? "fire-engine;chrome-cdp" : undefined,
    useScrapingBee ? "scrapingBee" : undefined,
    useFireEngine ? "fire-engine" : undefined,
    useScrapingBee ? "scrapingBeeLoad" : undefined,
    useFireEngine ? undefined : "playwright",
    "fetch",
  ].filter(Boolean);

  const filteredDefaultOrder = defaultOrder.filter(
    (scraper: (typeof baseScrapers)[number]) =>
      availableScrapers.includes(scraper)
  );
  const uniqueScrapers = new Set(
    defaultScraper
      ? [defaultScraper, ...filteredDefaultOrder, ...availableScrapers]
      : [...filteredDefaultOrder, ...availableScrapers]
  );

  const scrapersInOrder = Array.from(uniqueScrapers);
  return scrapersInOrder as (typeof baseScrapers)[number][];
}

export async function scrapeSingleUrl(
  jobId: string,
  urlToScrape: string,
  pageOptions: PageOptions,
  extractorOptions?: ExtractorOptions,
  existingHtml?: string,
  priority?: number,
  teamId?: string
): Promise<Document> {
  pageOptions = {
    includeMarkdown: pageOptions.includeMarkdown ?? true,
    includeExtract: pageOptions.includeExtract ?? false,
    includeHtml: pageOptions.includeHtml ?? false,
    includeRawHtml: pageOptions.includeRawHtml ?? false,
    waitFor: pageOptions.waitFor ?? undefined,
    screenshot: pageOptions.screenshot ?? false,
    fullPageScreenshot: pageOptions.fullPageScreenshot ?? false,
    headers: pageOptions.headers ?? undefined,
    includeLinks: pageOptions.includeLinks ?? true,
    replaceAllPathsWithAbsolutePaths:
      pageOptions.replaceAllPathsWithAbsolutePaths ?? true,
    parsePDF: pageOptions.parsePDF ?? true,
    removeTags: pageOptions.removeTags ?? [],
    onlyIncludeTags: pageOptions.onlyIncludeTags ?? [],
    useFastMode: pageOptions.useFastMode ?? false,
    disableJsDom: pageOptions.disableJsDom ?? false,
    atsv: pageOptions.atsv ?? false,
  };

  if (extractorOptions) {
    extractorOptions = {
      mode: extractorOptions?.mode ?? "llm-extraction-from-markdown",
    };
  }

  if (!existingHtml) {
    existingHtml = "";
  }

  urlToScrape = urlToScrape.trim();

  const attemptScraping = async (
    url: string,
    method: (typeof baseScrapers)[number]
  ) => {
    let scraperResponse: {
      text: string;
      screenshot: string;
      metadata: { pageStatusCode?: number; pageError?: string | null };
    } = { text: "", screenshot: "", metadata: {} };
    let screenshot = "";

    const timer = Date.now();

    switch (method) {
      case "fire-engine":
      case "fire-engine;chrome-cdp":
        let engine: "playwright" | "chrome-cdp" | "tlsclient" = "playwright";
        if (method === "fire-engine;chrome-cdp") {
          engine = "chrome-cdp";
        }

        if (process.env.FIRE_ENGINE_BETA_URL) {
          const response = await scrapWithFireEngine({
            url,
            waitFor: pageOptions.waitFor,
            screenshot: pageOptions.screenshot,
            fullPageScreenshot: pageOptions.fullPageScreenshot,
            pageOptions: pageOptions,
            headers: pageOptions.headers,
            fireEngineOptions: {
              engine: engine,
              atsv: pageOptions.atsv,
              disableJsDom: pageOptions.disableJsDom,
            },
            priority,
            teamId,
          });
          scraperResponse.text = response.html;
          scraperResponse.screenshot = response.screenshot;
          scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
          scraperResponse.metadata.pageError = response.pageError;
        }
        break;
      case "scrapingBee":
        if (process.env.SCRAPING_BEE_API_KEY) {
          const response = await scrapWithScrapingBee(
            url,
            "domcontentloaded",
            pageOptions.fallback === false ? 7000 : 15000
          );
          scraperResponse.text = response.content;
          scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
          scraperResponse.metadata.pageError = response.pageError;
        }
        break;
      case "playwright":
        if (process.env.PLAYWRIGHT_MICROSERVICE_URL) {
          const response = await scrapWithPlaywright(
            url,
            pageOptions.waitFor,
            pageOptions.headers
          );
          scraperResponse.text = response.content;
          scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
          scraperResponse.metadata.pageError = response.pageError;
        }
        break;
      case "scrapingBeeLoad":
        if (process.env.SCRAPING_BEE_API_KEY) {
          const response = await scrapWithScrapingBee(url, "networkidle2");
          scraperResponse.text = response.content;
          scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
          scraperResponse.metadata.pageError = response.pageError;
        }
        break;
      case "fetch":
        const response = await scrapeWithFetch(url);
        scraperResponse.text = response.content;
        scraperResponse.metadata.pageStatusCode = response.pageStatusCode;
        scraperResponse.metadata.pageError = response.pageError;
        break;
    }

    let customScrapedContent: FireEngineResponse | null = null;

    // Check for custom scraping conditions
    const customScraperResult = await handleCustomScraping(
      scraperResponse.text,
      url
    );

    if (customScraperResult) {
      switch (customScraperResult.scraper) {
        case "fire-engine":
          customScrapedContent = await scrapWithFireEngine({
            url: customScraperResult.url,
            waitFor: customScraperResult.waitAfterLoad,
            screenshot: false,
            pageOptions: customScraperResult.pageOptions,
          });
          if (screenshot) {
            customScrapedContent.screenshot = screenshot;
          }
          break;
      }
    }

    if (customScrapedContent) {
      scraperResponse.text = customScrapedContent.html;
      screenshot = customScrapedContent.screenshot;
    }
    //* TODO: add an optional to return markdown or structured/extracted content
    let cleanedHtml = removeUnwantedElements(scraperResponse.text, pageOptions);
    const text = await parseMarkdown(cleanedHtml);

    return {
      text,
      html: cleanedHtml,
      rawHtml: scraperResponse.text,
      screenshot: scraperResponse.screenshot,
      pageStatusCode: scraperResponse.metadata.pageStatusCode,
      pageError: scraperResponse.metadata.pageError || undefined,
    };
  };

  let { text, html, rawHtml, screenshot, pageStatusCode, pageError } = {
    text: "",
    html: "",
    rawHtml: "",
    screenshot: "",
    pageStatusCode: 200,
    pageError: undefined,
  };
  try {
    let urlKey = urlToScrape;
    try {
      urlKey = new URL(urlToScrape).hostname.replace(/^www\./, "");
    } catch (error) {
      Logger.error(`Invalid URL key, trying: ${urlToScrape}`);
    }
    const defaultScraper = urlSpecificParams[urlKey]?.defaultScraper ?? "";
    const scrapersInOrder = getScrapingFallbackOrder(
      defaultScraper,
      pageOptions && pageOptions.waitFor && pageOptions.waitFor > 0,
      pageOptions &&
        (pageOptions.screenshot || pageOptions.fullPageScreenshot) &&
        (pageOptions.screenshot === true ||
          pageOptions.fullPageScreenshot === true),
      pageOptions && pageOptions.headers && pageOptions.headers !== undefined
    );

    for (const scraper of scrapersInOrder) {
      // If exists text coming from crawler, use it
      if (
        existingHtml &&
        existingHtml.trim().length >= 100 &&
        !existingHtml.includes(clientSideError)
      ) {
        rawHtml = existingHtml;
        let cleanedHtml = removeUnwantedElements(existingHtml, pageOptions);
        text = await parseMarkdown(cleanedHtml);
        html = cleanedHtml;
        break;
      }

      const attempt = await attemptScraping(urlToScrape, scraper);
      text = attempt.text ?? "";
      html = attempt.html ?? "";
      rawHtml = attempt.rawHtml ?? "";
      screenshot = attempt.screenshot ?? "";

      if (attempt.pageStatusCode) {
        pageStatusCode = attempt.pageStatusCode;
      }
      if (attempt.pageError && attempt.pageStatusCode >= 400) {
        pageError = attempt.pageError;
      } else if (
        attempt &&
        attempt.pageStatusCode &&
        attempt.pageStatusCode < 400
      ) {
        pageError = undefined;
      }

      if (
        (rawHtml && rawHtml.trim().length >= 100) ||
        (typeof screenshot === "string" && screenshot.length > 0)
      ) {
        Logger.debug(
          `⛏️ ${scraper}: Successfully scraped ${urlToScrape} with rawHtml length >= 100 or screenshot, breaking`
        );
        break;
      }
      if (pageStatusCode && (pageStatusCode == 404 || pageStatusCode == 500)) {
        Logger.debug(
          `⛏️ ${scraper}: Successfully scraped ${urlToScrape} with status code 404, breaking`
        );
        break;
      }

      Logger.debug(
        `⛏️ ${scraper}: Failed to scrape ${urlToScrape}, trying next scraper`
      );
    }

    if (!rawHtml) {
      throw new Error(`All scraping methods failed for URL: ${urlToScrape}`);
    }

    const soup = cheerio.load(rawHtml);
    const metadata = extractMetadata(soup, urlToScrape);

    let linksOnPage: string[] | undefined;

    if (pageOptions.includeLinks) {
      linksOnPage = extractLinks(rawHtml, urlToScrape);
    }

    let document: Document;
    if (screenshot && screenshot.length > 0) {
      document = {
        content: text,
        markdown:
          pageOptions.includeMarkdown || pageOptions.includeExtract
            ? text
            : undefined,
        html: pageOptions.includeHtml ? html : undefined,
        rawHtml: rawHtml,
        linksOnPage: pageOptions.includeLinks ? linksOnPage : undefined,
        metadata: {
          ...metadata,
          screenshot: screenshot,
          sourceURL: urlToScrape,
          pageStatusCode: pageStatusCode,
          pageError: pageError,
        },
      };
    } else {
      document = {
        content: text,
        markdown:
          pageOptions.includeMarkdown || pageOptions.includeExtract
            ? text
            : undefined,
        html: pageOptions.includeHtml ? html : undefined,
        rawHtml: rawHtml,
        metadata: {
          ...metadata,
          sourceURL: urlToScrape,
          pageStatusCode: pageStatusCode,
          pageError: pageError,
        },
        linksOnPage: pageOptions.includeLinks ? linksOnPage : undefined,
      };
    }

    return document;
  } catch (error) {
    Logger.debug(
      `⛏️ Error: ${error.message} - Failed to fetch URL: ${urlToScrape}`
    );

    return {
      content: "",
      markdown:
        pageOptions.includeMarkdown || pageOptions.includeExtract
          ? ""
          : undefined,
      html: "",
      linksOnPage: pageOptions.includeLinks ? [] : undefined,
      metadata: {
        sourceURL: urlToScrape,
        pageStatusCode: pageStatusCode,
        pageError: pageError,
      },
    } as Document;
  }
}
