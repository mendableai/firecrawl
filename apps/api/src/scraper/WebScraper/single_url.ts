import * as cheerio from "cheerio";
import { extractMetadata } from "./utils/metadata";
import dotenv from "dotenv";
import { Document, PageOptions } from "../../lib/entities";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { urlSpecificParams } from "./utils/custom/website_params";
import { removeUnwantedElements } from "./utils/removeUnwantedElements";
import { scrapeWithFetch } from "./scrapers/fetch";
import { scrapeWithPlaywright } from "./scrapers/playwright";
import { extractLinks } from "./utils/utils";
import { Logger } from "../../lib/logger";
import { clientSideError } from "../../strings";
import axios from "axios";

dotenv.config();

export const callWebhook = async (
  webhookUrl: string,
  data: any,
  metadata: any,
  scrapeId?: string,
) => {
  let retryCount = 0;
  while (retryCount < 3) {
    try {
      await axios.post(
        webhookUrl,
        {
          scrapeId: scrapeId ?? "unknown",
          data,
          metadata,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );

      Logger.debug(`Webhook sent for scrape ID: ${scrapeId}`);
      break;
    } catch (error) {
      Logger.debug(
        `Error sending webhook to ${webhookUrl} for scrape ID: ${scrapeId}, retry ${retryCount}. Error: ${error}`,
      );
    }

    retryCount++;
  }
};

export const baseScrapers = ["playwright", "fetch"].filter(Boolean);

export async function generateRequestParams(
  url: string,
  wait_browser: string = "domcontentloaded",
  timeout: number = 60000,
): Promise<any> {
  const defaultParams = {
    url: url,
    params: {
      timeout: timeout,
      wait_browser: wait_browser,
      stealth_proxy: true,
    },
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
function getScrapingFallbackOrder(defaultScraper?: string) {
  const availableScrapers = baseScrapers.filter((scraper) => {
    switch (scraper) {
      case "playwright":
        return !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      default:
        return true;
    }
  });

  let defaultOrder = ["playwright", "fetch"].filter(Boolean);

  const filteredDefaultOrder = defaultOrder.filter(
    (scraper: (typeof baseScrapers)[number]) =>
      availableScrapers.includes(scraper),
  );
  const uniqueScrapers = new Set(
    defaultScraper
      ? [defaultScraper, ...filteredDefaultOrder, ...availableScrapers]
      : [...filteredDefaultOrder, ...availableScrapers],
  );

  const scrapersInOrder = Array.from(uniqueScrapers);
  return scrapersInOrder as (typeof baseScrapers)[number][];
}

export async function scrapeSingleUrl(
  urlToScrape: string,
  pageOptions: PageOptions,
  existingHtml?: string,
  webhookUrl?: string,
  webhookMetadata?: any,
  scrapeId?: string,
): Promise<Document> {
  pageOptions = {
    includeMarkdown: pageOptions.includeMarkdown ?? true,
    includeExtract: pageOptions.includeExtract ?? false,
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

  if (!existingHtml) {
    existingHtml = "";
  }

  urlToScrape = urlToScrape.trim();

  const attemptScraping = async (
    url: string,
    method: (typeof baseScrapers)[number],
  ) => {
    let scraperResponse: {
      text: string;
      screenshot: string;
      metadata: { pageStatusCode?: number; pageError?: string | null };
    } = { text: "", screenshot: "", metadata: {} };

    switch (method) {
      case "playwright":
        if (process.env.PLAYWRIGHT_MICROSERVICE_URL) {
          const response = await scrapeWithPlaywright(
            url,
            pageOptions.waitFor,
            pageOptions.headers,
          );
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
    const scrapersInOrder = getScrapingFallbackOrder(defaultScraper);

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
          `⛏️ ${scraper}: Successfully scraped ${urlToScrape} with rawHtml length >= 100 or screenshot, breaking`,
        );
        break;
      }
      if (pageStatusCode && (pageStatusCode == 404 || pageStatusCode == 500)) {
        Logger.debug(
          `⛏️ ${scraper}: Successfully scraped ${urlToScrape} with status code 404, breaking`,
        );
        break;
      }

      Logger.debug(
        `⛏️ ${scraper}: Failed to scrape ${urlToScrape}, trying next scraper`,
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
        html: pageOptions.includeRawHtml ? html : undefined,
        rawHtml: pageOptions.includeRawHtml ? rawHtml : undefined,
        linksOnPage: pageOptions.includeLinks ? linksOnPage : undefined,
        metadata: {
          ...metadata,
          screenshot: screenshot,
          sourceURL: urlToScrape,
          pageStatusCode: pageStatusCode,
          statusCode: pageStatusCode,
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
        html: pageOptions.includeRawHtml ? html : undefined,
        rawHtml: pageOptions.includeRawHtml ? rawHtml : undefined,
        metadata: {
          ...metadata,
          sourceURL: urlToScrape,
          pageStatusCode: pageStatusCode,
          statusCode: pageStatusCode,
          pageError: pageError,
        },
        linksOnPage: pageOptions.includeLinks ? linksOnPage : undefined,
      };
    }

    if (webhookUrl) {
      Logger.debug(
        `Sending webhook for scrape ID  ${scrapeId} to ${webhookUrl}`,
      );
      await callWebhook(webhookUrl, document, webhookMetadata, scrapeId);
    } else {
      Logger.debug(`No webhook URL provided, skipping webhook`);
    }

    return document;
  } catch (error) {
    Logger.debug(
      `⛏️ Error: ${error.message} - Failed to fetch URL: ${urlToScrape}`,
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
