import * as cheerio from "cheerio";
import { extractMetadata } from "./utils/metadata";
import dotenv from "dotenv";
import {
  Document,
  PageOptions,
  FireEngineResponse,
  ExtractorOptions,
  Action,
} from "../../lib/entities";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { urlSpecificParams } from "./utils/custom/website_params";
import { fetchAndProcessPdf } from "./utils/pdfProcessor";
import { handleCustomScraping } from "./custom/handleCustomScraping";
import { removeUnwantedElements } from "./utils/removeUnwantedElements";
import { scrapWithFetch } from "./scrapers/fetch";
import { scrapWithFireEngine } from "./scrapers/fireEngine";
import { scrapWithPlaywright } from "./scrapers/playwright";
import { scrapWithScrapingBee } from "./scrapers/scrapingBee";
import { extractLinks } from "./utils/utils";
import { Logger } from "../../lib/logger";
import { ScrapeEvents } from "../../lib/scrape-events";
import { clientSideError } from "../../strings";

dotenv.config();

const useScrapingBee = process.env.SCRAPING_BEE_API_KEY !== '' && process.env.SCRAPING_BEE_API_KEY !== undefined;
const useFireEngine = process.env.FIRE_ENGINE_BETA_URL !== '' && process.env.FIRE_ENGINE_BETA_URL !== undefined;

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
  isHeadersPresent: boolean = false,
  isActionsPresent: boolean = false,
) {
  if (isActionsPresent) {
    return useFireEngine ? ["fire-engine;chrome-cdp"] : [];
  }

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

  // if (isWaitPresent || isScreenshotPresent || isHeadersPresent) {
  //   defaultOrder = [
  //     "fire-engine",
  //     useFireEngine ? undefined : "playwright",
  //     ...defaultOrder.filter(
  //       (scraper) => scraper !== "fire-engine" && scraper !== "playwright"
  //     ),
  //   ].filter(Boolean);
  // }

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



export async function scrapSingleUrl(
  jobId: string,
  urlToScrap: string,
  pageOptions: PageOptions,
  extractorOptions?: ExtractorOptions,
  existingHtml?: string,
  priority?: number,
  teamId?: string
): Promise<Document> {
  pageOptions = {
    includeMarkdown: pageOptions.includeMarkdown ?? true,
    includeExtract: pageOptions.includeExtract ?? false,
    onlyMainContent: pageOptions.onlyMainContent ?? false,
    includeHtml: pageOptions.includeHtml ?? false,
    includeRawHtml: pageOptions.includeRawHtml ?? false,
    waitFor: pageOptions.waitFor ?? undefined,
    screenshot: pageOptions.screenshot ?? false,
    fullPageScreenshot: pageOptions.fullPageScreenshot ?? false,
    headers: pageOptions.headers ?? undefined,
    includeLinks: pageOptions.includeLinks ?? true,
    replaceAllPathsWithAbsolutePaths: pageOptions.replaceAllPathsWithAbsolutePaths ?? true,
    parsePDF: pageOptions.parsePDF ?? true,
    removeTags: pageOptions.removeTags ?? [],
    onlyIncludeTags: pageOptions.onlyIncludeTags ?? [],
    useFastMode: pageOptions.useFastMode ?? false,
    disableJsDom: pageOptions.disableJsDom ?? false,
    atsv: pageOptions.atsv ?? false,
    actions: pageOptions.actions ?? undefined,
  }

  if (extractorOptions) {
    extractorOptions = {
      mode: extractorOptions?.mode ?? "llm-extraction-from-markdown",
    }
  }

  if (!existingHtml) {
    existingHtml = "";
  }

  urlToScrap = urlToScrap.trim();

  const attemptScraping = async (
    url: string,
    method: (typeof baseScrapers)[number]
  ) => {
    let scraperResponse: {
      text: string;
      screenshot: string;
      actions?: {
        screenshots: string[];
      };
      metadata: { pageStatusCode?: number; pageError?: string | null };
    } = { text: "", screenshot: "", metadata: {} };
    let screenshot = "";

    const timer = Date.now();
    const logInsertPromise = ScrapeEvents.insert(jobId, {
      type: "scrape",
      url,
      worker: process.env.FLY_MACHINE_ID,
      method,
      result: null,
    });

    switch (method) {
      case "fire-engine":
      case "fire-engine;chrome-cdp":  

        let engine: "playwright" | "chrome-cdp" | "tlsclient" = "playwright";
        if (method === "fire-engine;chrome-cdp") {
          engine = "chrome-cdp";
        }

        if (process.env.FIRE_ENGINE_BETA_URL) {
          const processedActions: Action[] = pageOptions.actions?.flatMap((action: Action, index: number, array: Action[]) => {
            if (action.type === "click" || action.type === "write" || action.type === "press") {
              const result: Action[] = [];
              // Don't add a wait if the previous action is a wait
              if (index === 0 || array[index - 1].type !== "wait") {
                result.push({ type: "wait", milliseconds: 1200 } as Action);
              }
              result.push(action);
              // Don't add a wait if the next action is a wait
              if (index === array.length - 1 || array[index + 1].type !== "wait") {
                result.push({ type: "wait", milliseconds: 1200 } as Action);
              }
              return result;
            }
            return [action as Action];
          }) ?? [] as Action[];
          
          const response = await scrapWithFireEngine({
            url,
            ...(engine === "chrome-cdp" ? ({
              actions: [
                ...(pageOptions.waitFor ? [{
                  type: "wait" as const,
                  milliseconds: pageOptions.waitFor,
                }] : []),
                ...((pageOptions.screenshot || pageOptions.fullPageScreenshot) ? [{
                  type: "screenshot" as const,
                  fullPage: !!pageOptions.fullPageScreenshot,
                }] : []),
                ...processedActions,
              ],
            }) : ({
              waitFor: pageOptions.waitFor,
              screenshot: pageOptions.screenshot,
              fullPageScreenshot: pageOptions.fullPageScreenshot,
            })),
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
          if (pageOptions.screenshot || pageOptions.fullPageScreenshot) {
            scraperResponse.screenshot = (response.screenshots ?? []).splice(0, 1)[0] ?? "";
          }
          if (pageOptions.actions) {
            scraperResponse.actions = {
              screenshots: response.screenshots ?? [],
            };
          }
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
        const response = await scrapWithFetch(url);
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
            actions: customScraperResult.waitAfterLoad ? ([
              {
                type: "wait",
                milliseconds: customScraperResult.waitAfterLoad,
              }
            ]) : ([]),
            pageOptions: customScraperResult.pageOptions,
          });
          break;
        case "pdf":
          const { content, pageStatusCode, pageError } =
            await fetchAndProcessPdf(
              customScraperResult.url,
              pageOptions?.parsePDF
            );
          customScrapedContent = {
            html: content,
            pageStatusCode,
            pageError,
          };
          break;
      }
    }

    if (customScrapedContent) {
      scraperResponse.text = customScrapedContent.html;
    }
    //* TODO: add an optional to return markdown or structured/extracted content
    let cleanedHtml = removeUnwantedElements(scraperResponse.text, pageOptions);
    const text = await parseMarkdown(cleanedHtml);

    const insertedLogId = await logInsertPromise;
    ScrapeEvents.updateScrapeResult(insertedLogId, {
      response_size: scraperResponse.text.length,
      success: !(scraperResponse.metadata.pageStatusCode && scraperResponse.metadata.pageStatusCode >= 400) && !!text && (text.trim().length >= 100),
      error: scraperResponse.metadata.pageError,
      response_code: scraperResponse.metadata.pageStatusCode,
      time_taken: Date.now() - timer,
    });

    return {
      text,
      html: cleanedHtml,
      rawHtml: scraperResponse.text,
      screenshot: scraperResponse.screenshot,
      actions: scraperResponse.actions,
      pageStatusCode: scraperResponse.metadata.pageStatusCode,
      pageError: scraperResponse.metadata.pageError || undefined,
    };
  };

  let { text, html, rawHtml, screenshot, actions, pageStatusCode, pageError } = {
    text: "",
    html: "",
    rawHtml: "",
    screenshot: "",
    actions: undefined,
    pageStatusCode: 200,
    pageError: undefined,
  };
  try {
    let urlKey = urlToScrap;
    try {
      urlKey = new URL(urlToScrap).hostname.replace(/^www\./, "");
    } catch (error) {
      Logger.error(`Invalid URL key, trying: ${urlToScrap}`);
    }
    const defaultScraper = urlSpecificParams[urlKey]?.defaultScraper ?? "";
    const scrapersInOrder = getScrapingFallbackOrder(
      defaultScraper,
      pageOptions && pageOptions.waitFor && pageOptions.waitFor > 0,
      pageOptions && (pageOptions.screenshot || pageOptions.fullPageScreenshot) && (pageOptions.screenshot === true || pageOptions.fullPageScreenshot === true),
      pageOptions && pageOptions.headers && pageOptions.headers !== undefined,
      pageOptions && Array.isArray(pageOptions.actions) && pageOptions.actions.length > 0,
    );

    for (const scraper of scrapersInOrder) {
      // If exists text coming from crawler, use it
      if (existingHtml && existingHtml.trim().length >= 100 && !existingHtml.includes(clientSideError)) {
        let cleanedHtml = removeUnwantedElements(existingHtml, pageOptions);
        text = await parseMarkdown(cleanedHtml);
        html = cleanedHtml;
        break;
      }

      const attempt = await attemptScraping(urlToScrap, scraper);
      text = attempt.text ?? "";
      html = attempt.html ?? "";
      rawHtml = attempt.rawHtml ?? "";
      screenshot = attempt.screenshot ?? "";
      actions = attempt.actions ?? undefined;

      if (attempt.pageStatusCode) {
        pageStatusCode = attempt.pageStatusCode;
      }
      if (attempt.pageError && (attempt.pageStatusCode >= 400 || scrapersInOrder.indexOf(scraper) === scrapersInOrder.length - 1)) { // force pageError if it's the last scraper and it failed too
        pageError = attempt.pageError;
        
        if (attempt.pageStatusCode < 400 || !attempt.pageStatusCode) {
          pageStatusCode = 500;
        }
      } else if (attempt && attempt.pageStatusCode && attempt.pageStatusCode < 400) {
        pageError = undefined;
      }

      if ((text && text.trim().length >= 100) || (typeof screenshot === "string" && screenshot.length > 0)) {
        Logger.debug(`⛏️ ${scraper}: Successfully scraped ${urlToScrap} with text length >= 100 or screenshot, breaking`);
        break;
      }
      if (pageStatusCode && (pageStatusCode == 404 || pageStatusCode == 500)) {
        Logger.debug(`⛏️ ${scraper}: Successfully scraped ${urlToScrap} with status code 404, breaking`);
        break;
      }
      // const nextScraperIndex = scrapersInOrder.indexOf(scraper) + 1;
      // if (nextScraperIndex < scrapersInOrder.length) {
      //   Logger.debug(`⛏️ ${scraper} Failed to fetch URL: ${urlToScrap} with status: ${pageStatusCode}, error: ${pageError} | Falling back to ${scrapersInOrder[nextScraperIndex]}`);
      // }
    }

    if (!text) {
      throw new Error(`All scraping methods failed for URL: ${urlToScrap}`);
    }

    const soup = cheerio.load(rawHtml);
    const metadata = extractMetadata(soup, urlToScrap);

    let linksOnPage: string[] | undefined;

    if (pageOptions.includeLinks) {
      linksOnPage = extractLinks(rawHtml, urlToScrap);
    }

    let document: Document = {
      content: text,
      markdown: pageOptions.includeMarkdown || pageOptions.includeExtract ? text : undefined,
      html: pageOptions.includeHtml ? html : undefined,
      rawHtml:
        pageOptions.includeRawHtml ||
          (extractorOptions?.mode === "llm-extraction-from-raw-html" && pageOptions.includeExtract)
          ? rawHtml
          : undefined,
      linksOnPage: pageOptions.includeLinks ? linksOnPage : undefined,
      actions,
      metadata: {
        ...metadata,
        ...(screenshot && screenshot.length > 0 ? ({
          screenshot,
        }) : {}),
        sourceURL: urlToScrap,
        pageStatusCode: pageStatusCode,
        pageError: pageError,
      },
    };

    return document;
  } catch (error) {
    Logger.debug(`⛏️ Error: ${error.message} - Failed to fetch URL: ${urlToScrap}`);
    ScrapeEvents.insert(jobId, {
      type: "error",
      message: typeof error === "string" ? error : typeof error.message === "string" ? error.message : JSON.stringify(error),
      stack: error.stack,
    });
    return {
      content: "",
      markdown: pageOptions.includeMarkdown || pageOptions.includeExtract ? "" : undefined,
      html: "",
      linksOnPage: pageOptions.includeLinks ? [] : undefined,
      metadata: {
        sourceURL: urlToScrap,
        pageStatusCode: pageStatusCode,
        pageError: pageError,
      },
    } as Document;
  }
}
