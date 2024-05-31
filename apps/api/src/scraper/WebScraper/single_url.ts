import * as cheerio from "cheerio";
import { ScrapingBeeClient } from "scrapingbee";
import { extractMetadata } from "./utils/metadata";
import dotenv from "dotenv";
import { Document, PageOptions, FireEngineResponse } from "../../lib/entities";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { excludeNonMainTags } from "./utils/excludeTags";
import { urlSpecificParams } from "./utils/custom/website_params";
import { fetchAndProcessPdf } from "./utils/pdfProcessor";

dotenv.config();

const baseScrapers = [
  "fire-engine",
  "scrapingBee",
  "playwright",
  "scrapingBeeLoad",
  "fetch",
] as const;

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
    console.error(`Error generating URL key: ${error}`);
    return defaultParams;
  }
}
export async function scrapWithFireEngine(
  url: string,
  waitFor: number = 0,
  screenshot: boolean = false,
  headers?: Record<string, string>,
  options?: any
): Promise<FireEngineResponse> {
  try {
    const reqParams = await generateRequestParams(url);
    // If the user has passed a wait parameter in the request, use that
    const waitParam = reqParams["params"]?.wait ?? waitFor;
    const screenshotParam = reqParams["params"]?.screenshot ?? screenshot;
    console.log(
      `[Fire-Engine] Scraping ${url} with wait: ${waitParam} and screenshot: ${screenshotParam}`
    );

    const response = await fetch(process.env.FIRE_ENGINE_BETA_URL + "/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: url,
        wait: waitParam,
        screenshot: screenshotParam,
        headers: headers,
      }),
    });

    if (!response.ok) {
      console.error(
        `[Fire-Engine] Error fetching url: ${url} with status: ${response.status}`
      );
      return { html: "", screenshot: "" };
    }

    const contentType = response.headers["content-type"];
    if (contentType && contentType.includes("application/pdf")) {
      return { html: await fetchAndProcessPdf(url), screenshot: "" };
    } else {
      const data = await response.json();
      const html = data.content;
      const screenshot = data.screenshot;
      return { html: html ?? "", screenshot: screenshot ?? "" };
    }
  } catch (error) {
    console.error(`[Fire-Engine][c] Error fetching url: ${url} -> ${error}`);
    return { html: "", screenshot: "" };
  }
}

export async function scrapWithScrapingBee(
  url: string,
  wait_browser: string = "domcontentloaded",
  timeout: number = 15000
): Promise<string> {
  try {
    const client = new ScrapingBeeClient(process.env.SCRAPING_BEE_API_KEY);
    const clientParams = await generateRequestParams(
      url,
      wait_browser,
      timeout
    );

    const response = await client.get(clientParams);

    if (response.status !== 200 && response.status !== 404) {
      console.error(
        `[ScrapingBee] Error fetching url: ${url} with status code ${response.status}`
      );
      return "";
    }

    const contentType = response.headers["content-type"];
    if (contentType && contentType.includes("application/pdf")) {
      return fetchAndProcessPdf(url);
    } else {
      const decoder = new TextDecoder();
      const text = decoder.decode(response.data);
      return text;
    }
  } catch (error) {
    console.error(`[ScrapingBee][c] Error fetching url: ${url} -> ${error}`);
    return "";
  }
}

export async function scrapWithPlaywright(
  url: string,
  waitFor: number = 0,
  headers?: Record<string, string>
): Promise<string> {
  try {
    const reqParams = await generateRequestParams(url);
    // If the user has passed a wait parameter in the request, use that
    const waitParam = reqParams["params"]?.wait ?? waitFor;

    const response = await fetch(process.env.PLAYWRIGHT_MICROSERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: url, wait: waitParam, headers: headers }),
    });

    if (!response.ok) {
      console.error(
        `[Playwright] Error fetching url: ${url} with status: ${response.status}`
      );
      return "";
    }

    const contentType = response.headers["content-type"];
    if (contentType && contentType.includes("application/pdf")) {
      return fetchAndProcessPdf(url);
    } else {
      const data = await response.json();
      const html = data.content;
      return html ?? "";
    }
  } catch (error) {
    console.error(`[Playwright][c] Error fetching url: ${url} -> ${error}`);
    return "";
  }
}

export async function scrapWithFetch(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `[Fetch] Error fetching url: ${url} with status: ${response.status}`
      );
      return "";
    }

    const contentType = response.headers["content-type"];
    if (contentType && contentType.includes("application/pdf")) {
      return fetchAndProcessPdf(url);
    } else {
      const text = await response.text();
      return text;
    }
  } catch (error) {
    console.error(`[Fetch][c] Error fetching url: ${url} -> ${error}`);
    return "";
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
      case "playwright":
        return !!process.env.PLAYWRIGHT_MICROSERVICE_URL;
      default:
        return true;
    }
  });

  let defaultOrder = [
    "scrapingBee",
    "fire-engine",
    "playwright",
    "scrapingBeeLoad",
    "fetch",
  ];

  if (isWaitPresent || isScreenshotPresent || isHeadersPresent) {
    defaultOrder = [
      "fire-engine",
      "playwright",
      ...defaultOrder.filter(
        (scraper) => scraper !== "fire-engine" && scraper !== "playwright"
      ),
    ];
  }

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
  console.log(`Scrapers in order: ${scrapersInOrder}`);
  return scrapersInOrder as (typeof baseScrapers)[number][];
}

async function handleCustomScraping(
  text: string,
  url: string
): Promise<FireEngineResponse | null> {
  if (text.includes('<meta name="readme-deploy"')) {
    console.log(
      `Special use case detected for ${url}, using Fire Engine with wait time 1000ms`
    );
    return await scrapWithFireEngine(url, 1000);
  }
  return null;
}

export async function scrapSingleUrl(
  urlToScrap: string,
  pageOptions: PageOptions = {
    onlyMainContent: true,
    includeHtml: false,
    waitFor: 0,
    screenshot: false,
  },
  existingHtml: string = ""
): Promise<Document> {
  urlToScrap = urlToScrap.trim();

  const removeUnwantedElements = (html: string, pageOptions: PageOptions) => {
    const soup = cheerio.load(html);
    soup("script, style, iframe, noscript, meta, head").remove();
    if (pageOptions.onlyMainContent) {
      // remove any other tags that are not in the main content
      excludeNonMainTags.forEach((tag) => {
        soup(tag).remove();
      });
    }
    return soup.html();
  };

  const attemptScraping = async (
    url: string,
    method: (typeof baseScrapers)[number]
  ) => {
    let text = "";
    let screenshot = "";
    switch (method) {
      case "fire-engine":
        if (process.env.FIRE_ENGINE_BETA_URL) {
          console.log(`Scraping ${url} with Fire Engine`);
          const response = await scrapWithFireEngine(
            url,
            pageOptions.waitFor,
            pageOptions.screenshot,
            pageOptions.headers
          );
          text = response.html;
          screenshot = response.screenshot;
        }
        break;
      case "scrapingBee":
        if (process.env.SCRAPING_BEE_API_KEY) {
          text = await scrapWithScrapingBee(
            url,
            "domcontentloaded",
            pageOptions.fallback === false ? 7000 : 15000
          );
        }
        break;
      case "playwright":
        if (process.env.PLAYWRIGHT_MICROSERVICE_URL) {
          text = await scrapWithPlaywright(url, pageOptions.waitFor, pageOptions.headers);
        }
        break;
      case "scrapingBeeLoad":
        if (process.env.SCRAPING_BEE_API_KEY) {
          text = await scrapWithScrapingBee(url, "networkidle2");
        }
        break;
      case "fetch":
        text = await scrapWithFetch(url);
        break;
    }

    // Check for custom scraping conditions
    const customScrapedContent = await handleCustomScraping(text, url);
    if (customScrapedContent) {
      text = customScrapedContent[0];
      screenshot = customScrapedContent[1];
    }

    //* TODO: add an optional to return markdown or structured/extracted content
    let cleanedHtml = removeUnwantedElements(text, pageOptions);

    return [await parseMarkdown(cleanedHtml), text, screenshot];
  };
  try {
    let [text, html, screenshot] = ["", "", ""];
    let urlKey = urlToScrap;
    try {
      urlKey = new URL(urlToScrap).hostname.replace(/^www\./, "");
    } catch (error) {
      console.error(`Invalid URL key, trying: ${urlToScrap}`);
    }
    const defaultScraper = urlSpecificParams[urlKey]?.defaultScraper ?? "";
    const scrapersInOrder = getScrapingFallbackOrder(
      defaultScraper,
      pageOptions && pageOptions.waitFor && pageOptions.waitFor > 0,
      pageOptions && pageOptions.screenshot && pageOptions.screenshot === true,
      pageOptions && pageOptions.headers && pageOptions.headers !== undefined
    );

    for (const scraper of scrapersInOrder) {
      // If exists text coming from crawler, use it
      if (existingHtml && existingHtml.trim().length >= 100) {
        let cleanedHtml = removeUnwantedElements(existingHtml, pageOptions);
        text = await parseMarkdown(cleanedHtml);
        html = existingHtml;
        break;
      }
      [text, html, screenshot] = await attemptScraping(urlToScrap, scraper);
      if (text && text.trim().length >= 100) break;
      const nextScraperIndex = scrapersInOrder.indexOf(scraper) + 1;
      if (nextScraperIndex < scrapersInOrder.length) {
        console.info(`Falling back to ${scrapersInOrder[nextScraperIndex]}`);
      }
    }

    if (!text) {
      throw new Error(`All scraping methods failed for URL: ${urlToScrap}`);
    }

    const soup = cheerio.load(html);
    const metadata = extractMetadata(soup, urlToScrap);

    let document: Document;
    if (screenshot && screenshot.length > 0) {
      document = {
        content: text,
        markdown: text,
        html: pageOptions.includeHtml ? html : undefined,
        metadata: {
          ...metadata,
          screenshot: screenshot,
          sourceURL: urlToScrap,
        },
      };
    } else {
      document = {
        content: text,
        markdown: text,
        html: pageOptions.includeHtml ? html : undefined,
        metadata: { ...metadata, sourceURL: urlToScrap },
      };
    }

    return document;
  } catch (error) {
    console.error(`Error: ${error} - Failed to fetch URL: ${urlToScrap}`);
    return {
      content: "",
      markdown: "",
      html: "",
      metadata: { sourceURL: urlToScrap },
    } as Document;
  }
}
