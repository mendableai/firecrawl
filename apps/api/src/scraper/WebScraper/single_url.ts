import * as cheerio from "cheerio";
import { ScrapingBeeClient } from "scrapingbee";
import { extractMetadata } from "./utils/metadata";
import dotenv from "dotenv";
import { Document, PageOptions } from "../../lib/entities";
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
  options?: any
): Promise<string> {
  try {
    const reqParams = await generateRequestParams(url);
    const wait_playwright = reqParams["params"]?.wait ?? 0;

    const response = await fetch(process.env.FIRE_ENGINE_BETA_URL+ "/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: url, wait: wait_playwright }),
    });

    if (!response.ok) {
      console.error(
        `[Fire-Engine] Error fetching url: ${url} with status: ${response.status}`
      );
      return "";
    }

    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('application/pdf')) {
      return fetchAndProcessPdf(url);
    } else {
      const data = await response.json();
      const html = data.content;
      return html ?? "";
    }
  } catch (error) {
    console.error(`Error scraping with Fire Engine: ${error}`);
    return "";
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
    
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('application/pdf')) {
      return fetchAndProcessPdf(url);
    } else {
      const decoder = new TextDecoder();
      const text = decoder.decode(response.data);
      return text;
    }
  } catch (error) {
    console.error(`[ScrapingBee] Error fetching url: ${url} -> ${error}`);
    return "";
  }
}

export async function scrapWithPlaywright(url: string): Promise<string> {
  try {
    const reqParams = await generateRequestParams(url);
    const wait_playwright = reqParams["params"]?.wait ?? 0;

    const response = await fetch(process.env.PLAYWRIGHT_MICROSERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: url, wait: wait_playwright }),
    });

    if (!response.ok) {
      console.error(
        `[Playwright] Error fetching url: ${url} with status: ${response.status}`
      );
      return "";
    }

    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('application/pdf')) {
      return fetchAndProcessPdf(url);
    } else {
      const data = await response.json();
      const html = data.content;
      return html ?? "";
    }
  } catch (error) {
    console.error(`Error scraping with Playwright: ${error}`);
    return "";
  }
}

function getScrapingFallbackOrder(defaultScraper?: string) {
  const fireEngineScraper = process.env.FIRE_ENGINE_BETA_URL ? ["fire-engine"] : [];
  const uniqueScrapers = new Set(defaultScraper ? [defaultScraper, ...fireEngineScraper, ...baseScrapers] : [...fireEngineScraper, ...baseScrapers]);
  const scrapersInOrder = Array.from(uniqueScrapers);
  return scrapersInOrder as typeof baseScrapers[number][];
}

export async function scrapSingleUrl(
  urlToScrap: string,
  pageOptions: PageOptions = { onlyMainContent: true, includeHtml: false },
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
    method: typeof baseScrapers[number]
  ) => {
    let text = "";
    switch (method) {
      case "fire-engine":
        text = await scrapWithFireEngine(url);
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
          text = await scrapWithPlaywright(url);
        }
        break;
      case "scrapingBeeLoad":
        if (process.env.SCRAPING_BEE_API_KEY) {
          text = await scrapWithScrapingBee(url, "networkidle2");
        }
        break;
      case "fetch":
        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.error(
              `Error fetching URL: ${url} with status: ${response.status}`
            );
            return "";
          }

          const contentType = response.headers['content-type'];
          if (contentType && contentType.includes('application/pdf')) {
            return fetchAndProcessPdf(url);
          } else {
            text = await response.text();
          }
        } catch (error) {
          console.error(`Error scraping URL: ${error}`);
          return "";
        }
        break;
    }

    //* TODO: add an optional to return markdown or structured/extracted content
    let cleanedHtml = removeUnwantedElements(text, pageOptions);

    return [await parseMarkdown(cleanedHtml), text];
  };
  try {
    let [text, html] = ["", ""];
    let urlKey = urlToScrap;
    try {
      urlKey = new URL(urlToScrap).hostname.replace(/^www\./, "");
    } catch (error) {
      console.error(`Invalid URL key, trying: ${urlToScrap}`);
    }
    const defaultScraper = urlSpecificParams[urlKey]?.defaultScraper ?? "";
    const scrapersInOrder = getScrapingFallbackOrder(defaultScraper) 

    for (const scraper of scrapersInOrder) {
      // If exists text coming from crawler, use it
      if (existingHtml && existingHtml.trim().length >= 100) {
        let cleanedHtml = removeUnwantedElements(existingHtml, pageOptions);
        text = await parseMarkdown(cleanedHtml);
        html = existingHtml;
        break;
      }
      [text, html] = await attemptScraping(urlToScrap, scraper);
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
    const document: Document = {
      content: text,
      markdown: text,
      html: pageOptions.includeHtml ? html : undefined,
      metadata: { ...metadata, sourceURL: urlToScrap },
    };

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
