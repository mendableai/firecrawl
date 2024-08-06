import { logScrape } from "../../../services/logging/scrape_log";
import { generateRequestParams } from "../single_url";
import { fetchAndProcessPdf } from "../utils/pdfProcessor";
import { universalTimeout } from "../global";
import { ScrapingBeeClient } from "scrapingbee";
import { Logger } from "../../../lib/logger";

/**
 * Scrapes a URL with ScrapingBee
 * @param url The URL to scrape
 * @param wait_browser The browser event to wait for
 * @param timeout The timeout for the scrape
 * @param pageOptions The options for the page
 * @returns The scraped content
 */
export async function scrapWithScrapingBee(
    url: string,
    wait_browser: string = "domcontentloaded",
    timeout: number = universalTimeout,
    pageOptions: { parsePDF?: boolean } = { parsePDF: true }
  ): Promise<{ content: string; pageStatusCode?: number; pageError?: string }> {
    const logParams = {
      url,
      scraper: wait_browser === "networkidle2" ? "scrapingBeeLoad" : "scrapingBee",
      success: false,
      response_code: null,
      time_taken_seconds: null,
      error_message: null,
      html: "",
      startTime: Date.now(),
    };
    try {
      const client = new ScrapingBeeClient(process.env.SCRAPING_BEE_API_KEY);
      const clientParams = await generateRequestParams(
        url,
        wait_browser,
        timeout
      );
      const response = await client.get({
        ...clientParams,
        params: {
          ...clientParams.params,
          transparent_status_code: "True",
        },
      });
      const contentType = response.headers["content-type"];
      if (contentType && contentType.includes("application/pdf")) {
        logParams.success = true;
        const { content, pageStatusCode, pageError } = await fetchAndProcessPdf(url, pageOptions?.parsePDF);
        logParams.response_code = pageStatusCode;
        logParams.error_message = pageError;
        return { content, pageStatusCode, pageError };
      } else {
        let text = "";
        try {
          const decoder = new TextDecoder();
          text = decoder.decode(response.data);
          logParams.success = true;
        } catch (decodeError) {
          Logger.debug(
            `⛏️ ScrapingBee: Error decoding response data for url: ${url} | Error: ${decodeError}`
          );
          logParams.error_message = decodeError.message || decodeError;
        }
        logParams.response_code = response.status;
        logParams.html = text;
        logParams.success = response.status >= 200 && response.status < 300 || response.status === 404;
        logParams.error_message = response.statusText !== "OK" ? response.statusText : undefined;
        return {
          content: text,
          pageStatusCode: response.status,
          pageError: response.statusText !== "OK" ? response.statusText : undefined,
        };
      }
    } catch (error) {
      Logger.debug(`⛏️ ScrapingBee: Error fetching url: ${url} | Error: ${error}`);
      logParams.error_message = error.message || error;
      logParams.response_code = error.response?.status;
      return {
        content: "",
        pageStatusCode: error.response?.status,
        pageError: error.response?.statusText,
      };
    } finally {
      const endTime = Date.now();
      logParams.time_taken_seconds = (endTime - logParams.startTime) / 1000;
      await logScrape(logParams);
    }
  }