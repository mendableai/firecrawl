import axios from "axios";
import { logScrape } from "../../../services/logging/scrape_log";
import { generateRequestParams } from "../single_url";
import { fetchAndProcessPdf } from "../utils/pdfProcessor";
import { universalTimeout } from "../global";
import { logger } from "../../../lib/logger";

/**
 * Scrapes a URL with Playwright
 * @param url The URL to scrape
 * @param waitFor The time to wait for the page to load
 * @param headers The headers to send with the request
 * @param pageOptions The options for the page
 * @returns The scraped content
 */
export async function scrapWithPlaywright(
  url: string,
  waitFor: number = 0,
  headers?: Record<string, string>,
  pageOptions: { parsePDF?: boolean } = { parsePDF: true }
): Promise<{ content: string; pageStatusCode?: number; pageError?: string }> {
  const logParams = {
    url,
    scraper: "playwright",
    success: false,
    response_code: undefined as number | undefined,
    time_taken_seconds: undefined as number | undefined,
    error_message: undefined as string | undefined,
    html: "",
    startTime: Date.now(),
  };

  try {
    const reqParams = await generateRequestParams(url);
    // If the user has passed a wait parameter in the request, use that
    const waitParam = reqParams["params"]?.wait ?? waitFor;

    const response = await axios.post(
      process.env.PLAYWRIGHT_MICROSERVICE_URL!,
      {
        url: url,
        wait_after_load: waitParam,
        timeout: universalTimeout + waitParam,
        headers: headers,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: universalTimeout + waitParam, // Add waitParam to timeout to account for the wait time
        transformResponse: [(data) => data], // Prevent axios from parsing JSON automatically
      }
    );

    if (response.status !== 200) {
      logger.debug(
        `⛏️ Playwright: Failed to fetch url: ${url} | status: ${response.status}, error: ${response.data?.pageError}`
      );
      logParams.error_message = response.data?.pageError;
      logParams.response_code = response.data?.pageStatusCode;
      return {
        content: "",
        pageStatusCode: response.data?.pageStatusCode,
        pageError: response.data?.pageError,
      };
    }

    const contentType = response.headers["content-type"];
    if (contentType && contentType.includes("application/pdf")) {
      logParams.success = true;
      const { content, pageStatusCode, pageError } = await fetchAndProcessPdf(url, pageOptions?.parsePDF ?? true);
      logParams.response_code = pageStatusCode;
      logParams.error_message = pageError;
      return { content, pageStatusCode, pageError };
    } else {
      const textData = response.data;
      try {
        const data = JSON.parse(textData);
        const html = data.content;
        logParams.success = true;
        logParams.html = html;
        logParams.response_code = data.pageStatusCode;
        logParams.error_message = data.pageError;
        return {
          content: html ?? "",
          pageStatusCode: data.pageStatusCode,
          pageError: data.pageError,
        };
      } catch (jsonError) {
        logParams.error_message = jsonError.message || jsonError;
        logger.debug(
          `⛏️ Playwright: Error parsing JSON response for url: ${url} | Error: ${jsonError}`
        );
        return { content: "", pageStatusCode: undefined, pageError: logParams.error_message };
      }
    }
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      logParams.error_message = "Request timed out";
      logger.debug(`⛏️ Playwright: Request timed out for ${url}`);
    } else {
      logParams.error_message = error.message || error;
      logger.debug(`⛏️ Playwright: Failed to fetch url: ${url} | Error: ${error}`);
    }
    return { content: "", pageStatusCode: undefined, pageError: logParams.error_message };
  } finally {
    const endTime = Date.now();
    logParams.time_taken_seconds = (endTime - logParams.startTime) / 1000;
    await logScrape(logParams);
  }
}
