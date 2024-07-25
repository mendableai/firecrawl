import axios from "axios";
import { logScrape } from "../../../services/logging/scrape_log";
import { fetchAndProcessPdf } from "../utils/pdfProcessor";
import { universalTimeout } from "../global";
import { Logger } from "../../../lib/logger";

/**
 * Scrapes a URL with Axios
 * @param url The URL to scrape
 * @param pageOptions The options for the page
 * @returns The scraped content
 */
export async function scrapWithFetch(
  url: string,
  pageOptions: { parsePDF?: boolean } = { parsePDF: true }
): Promise<{ content: string; pageStatusCode?: number; pageError?: string }> {
  const logParams = {
    url,
    scraper: "fetch",
    success: false,
    response_code: null,
    time_taken_seconds: null,
    error_message: null,
    html: "",
    startTime: Date.now(),
  };

  try {
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: universalTimeout,
      transformResponse: [(data) => data], // Prevent axios from parsing JSON automatically
    });

    if (response.status !== 200) {
      Logger.debug(`⛏️ Axios: Failed to fetch url: ${url} with status: ${response.status}`);
      logParams.error_message = response.statusText;
      logParams.response_code = response.status;
      return {
        content: "",
        pageStatusCode: response.status,
        pageError: response.statusText,
      };
    }

    const contentType = response.headers["content-type"];
    if (contentType && contentType.includes("application/pdf")) {
      logParams.success = true;
      const { content, pageStatusCode, pageError } = await fetchAndProcessPdf(url, pageOptions?.parsePDF);
      logParams.response_code = pageStatusCode;
      logParams.error_message = pageError;
      return { content, pageStatusCode, pageError };
    } else {
      const text = response.data;
      logParams.success = true;
      logParams.html = text;
      logParams.response_code = response.status;
      return { content: text, pageStatusCode: response.status, pageError: null };
    }
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      logParams.error_message = "Request timed out";
      Logger.debug(`⛏️ Axios: Request timed out for ${url}`);
    } else {
      logParams.error_message = error.message || error;
      Logger.debug(`⛏️ Axios: Failed to fetch url: ${url} | Error: ${error}`);
    }
    return { content: "", pageStatusCode: null, pageError: logParams.error_message };
  } finally {
    const endTime = Date.now();
    logParams.time_taken_seconds = (endTime - logParams.startTime) / 1000;
    await logScrape(logParams);
  }
}
