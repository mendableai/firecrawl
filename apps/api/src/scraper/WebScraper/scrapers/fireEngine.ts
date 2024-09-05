import axios from "axios";
import { FireEngineOptions, FireEngineResponse } from "../../../lib/entities";
import { logScrape } from "../../../services/logging/scrape_log";
import { generateRequestParams } from "../single_url";
import { fetchAndProcessPdf } from "../utils/pdfProcessor";
import { universalTimeout } from "../global";
import { Logger } from "../../../lib/logger";
import * as Sentry from "@sentry/node";

/**
 * Scrapes a URL with Fire-Engine
 * @param url The URL to scrape
 * @param waitFor The time to wait for the page to load
 * @param screenshot Whether to take a screenshot
 * @param fullPageScreenshot Whether to take a full page screenshot
 * @param pageOptions The options for the page
 * @param headers The headers to send with the request
 * @param options The options for the request
 * @returns The scraped content
 */
export async function scrapWithFireEngine({
  url,
  waitFor = 0,
  screenshot = false,
  fullPageScreenshot = false,
  pageOptions = { parsePDF: true, atsv: false, useFastMode: false, disableJsDom: false },
  fireEngineOptions = {},
  headers,
  options,
  priority,
  teamId,
}: {
  url: string;
  waitFor?: number;
  screenshot?: boolean;
  fullPageScreenshot?: boolean;
  pageOptions?: { scrollXPaths?: string[]; parsePDF?: boolean, atsv?: boolean, useFastMode?: boolean, disableJsDom?: boolean };
  fireEngineOptions?: FireEngineOptions;
  headers?: Record<string, string>;
  options?: any;
  priority?: number;
  teamId?: string;
}): Promise<FireEngineResponse> {
  const logParams = {
    url,
    scraper: "fire-engine",
    success: false,
    response_code: null,
    time_taken_seconds: null,
    error_message: null,
    html: "",
    startTime: Date.now(),
  };

  try {
    const reqParams = await generateRequestParams(url);
    let waitParam = reqParams["params"]?.wait ?? waitFor;
    let engineParam = reqParams["params"]?.engine ?? reqParams["params"]?.fireEngineOptions?.engine ?? fireEngineOptions?.engine  ?? "playwright";
    let screenshotParam = reqParams["params"]?.screenshot ?? screenshot;
    let fullPageScreenshotParam = reqParams["params"]?.fullPageScreenshot ?? fullPageScreenshot;
    let fireEngineOptionsParam : FireEngineOptions = reqParams["params"]?.fireEngineOptions ?? fireEngineOptions;


    let endpoint = "/scrape";

    if(options?.endpoint === "request") {
      endpoint = "/request";
    }

    let engine = engineParam; // do we want fireEngineOptions as first choice?

    if (pageOptions?.useFastMode) {
      fireEngineOptionsParam.engine = "tlsclient";
      engine = "tlsclient";
    }

    Logger.info(
      `⛏️ Fire-Engine (${engine}): Scraping ${url} | params: { wait: ${waitParam}, screenshot: ${screenshotParam}, fullPageScreenshot: ${fullPageScreenshot}, method: ${fireEngineOptionsParam?.method ?? "null"} }`
    );

    // atsv is only available for beta customers
    const betaCustomersString = process.env.BETA_CUSTOMERS;
    const betaCustomers = betaCustomersString ? betaCustomersString.split(",") : [];

    if (pageOptions?.atsv && betaCustomers.includes(teamId)) {
      fireEngineOptionsParam.atsv = true;
    } else {
      pageOptions.atsv = false;
    }

    const axiosInstance = axios.create({
      headers: { "Content-Type": "application/json" }
    });

    const startTime = Date.now();
    const _response = await Sentry.startSpan({
      name: "Call to fire-engine"
    }, async span => {
      
      return await axiosInstance.post(
        process.env.FIRE_ENGINE_BETA_URL + endpoint,
        {
          url: url,
          wait: waitParam,
          screenshot: screenshotParam,
          fullPageScreenshot: fullPageScreenshotParam,
          headers: headers,
          disableJsDom: pageOptions?.disableJsDom ?? false,
          priority,
          engine,
          instantReturn: true,
          ...fireEngineOptionsParam,
          atsv: pageOptions?.atsv ?? false,
          scrollXPaths: pageOptions?.scrollXPaths ?? [],
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(Sentry.isInitialized() ? ({
                "sentry-trace": Sentry.spanToTraceHeader(span),
                "baggage": Sentry.spanToBaggageHeader(span),
            }) : {}),
          }
        }
      );
    });

    let checkStatusResponse = await axiosInstance.get(`${process.env.FIRE_ENGINE_BETA_URL}/scrape/${_response.data.jobId}`);
    while (checkStatusResponse.data.processing && Date.now() - startTime < universalTimeout + waitParam) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second
      checkStatusResponse = await axiosInstance.get(`${process.env.FIRE_ENGINE_BETA_URL}/scrape/${_response.data.jobId}`);
    }

    if (checkStatusResponse.data.processing) {
      Logger.debug(`⛏️ Fire-Engine (${engine}): deleting request - jobId: ${_response.data.jobId}`);
      axiosInstance.delete(
        process.env.FIRE_ENGINE_BETA_URL + `/scrape/${_response.data.jobId}`, {
          validateStatus: (status) => true
        }
      ).catch((error) => {
        Logger.debug(`⛏️ Fire-Engine (${engine}): Failed to delete request - jobId: ${_response.data.jobId} | error: ${error}`);        
      });
      
      Logger.debug(`⛏️ Fire-Engine (${engine}): Request timed out for ${url}`);
      logParams.error_message = "Request timed out";
      return { html: "", screenshot: "", pageStatusCode: null, pageError: "" };
    }

    if (checkStatusResponse.status !== 200 || checkStatusResponse.data.error) {
      Logger.debug(
        `⛏️ Fire-Engine (${engine}): Failed to fetch url: ${url} \t status: ${checkStatusResponse.status}`
      );
      
      logParams.error_message = checkStatusResponse.data?.pageError ?? checkStatusResponse.data?.error;
      logParams.response_code = checkStatusResponse.data?.pageStatusCode;

      if(checkStatusResponse.data && checkStatusResponse.data?.pageStatusCode !== 200) {
        Logger.debug(`⛏️ Fire-Engine (${engine}): Failed to fetch url: ${url} \t status: ${checkStatusResponse.data?.pageStatusCode}`);
      }

      const pageStatusCode = checkStatusResponse.data?.pageStatusCode ? checkStatusResponse.data?.pageStatusCode : checkStatusResponse.data?.error && checkStatusResponse.data?.error.includes("Dns resolution error for hostname") ? 404 : undefined;

      return {
        html: "",
        screenshot: "",
        pageStatusCode,
        pageError: checkStatusResponse.data?.pageError ?? checkStatusResponse.data?.error,
      };
    }

    const contentType = checkStatusResponse.data.responseHeaders?.["content-type"];

    if (contentType && contentType.includes("application/pdf")) {
      const { content, pageStatusCode, pageError } = await fetchAndProcessPdf(
        url,
        pageOptions?.parsePDF
      );
      logParams.success = true;
      logParams.response_code = pageStatusCode;
      logParams.error_message = pageError;
      return { html: content, screenshot: "", pageStatusCode, pageError };
    } else {
      const data = checkStatusResponse.data;
      
      logParams.success =
        (data.pageStatusCode >= 200 && data.pageStatusCode < 300) ||
        data.pageStatusCode === 404;
      logParams.html = data.content ?? "";
      logParams.response_code = data.pageStatusCode;
      logParams.error_message = data.pageError ?? data.error;
      return {
        html: data.content ?? "",
        screenshot: data.screenshot ?? "",
        pageStatusCode: data.pageStatusCode,
        pageError: data.pageError ?? data.error,
      };
    }
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      Logger.debug(`⛏️ Fire-Engine: Request timed out for ${url}`);
      logParams.error_message = "Request timed out";
    } else {
      Logger.debug(`⛏️ Fire-Engine: Failed to fetch url: ${url} | Error: ${error}`);
      logParams.error_message = error.message || error;
    }
    return { html: "", screenshot: "", pageStatusCode: null, pageError: logParams.error_message };
  } finally {
    const endTime = Date.now();
    logParams.time_taken_seconds = (endTime - logParams.startTime) / 1000;
    await logScrape(logParams, pageOptions);
  }
}


