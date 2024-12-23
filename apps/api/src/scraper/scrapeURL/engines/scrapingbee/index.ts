import { ScrapingBeeClient } from "scrapingbee";
import { Meta } from "../..";
import { EngineScrapeResult } from "..";
import { specialtyScrapeCheck } from "../utils/specialtyHandler";
import { AxiosError, type AxiosResponse } from "axios";
import { EngineError } from "../../error";

const client = new ScrapingBeeClient(process.env.SCRAPING_BEE_API_KEY!);

export function scrapeURLWithScrapingBee(
  wait_browser: "domcontentloaded" | "networkidle2",
): (meta: Meta, timeToRun: number | undefined) => Promise<EngineScrapeResult> {
  return async (
    meta: Meta,
    timeToRun: number | undefined,
  ): Promise<EngineScrapeResult> => {
    let response: AxiosResponse<any>;
    const timeout = (timeToRun ?? 300000) + meta.options.waitFor;
    try {
      response = await client.get({
        url: meta.url,
        params: {
          timeout,
          wait_browser: wait_browser,
          wait: meta.options.waitFor,
          transparent_status_code: true,
          json_response: true,
          screenshot: meta.options.formats.includes("screenshot"),
          screenshot_full_page: meta.options.formats.includes(
            "screenshot@fullPage",
          ),
        },
        headers: {
          "ScrapingService-Request": "TRUE", // this is sent to the page, not to ScrapingBee - mogery
        },
      });
    } catch (error) {
      if (error instanceof AxiosError && error.response !== undefined) {
        response = error.response;
      } else {
        throw error;
      }
    }

    const data: Buffer = response.data;
    const body = JSON.parse(new TextDecoder().decode(data));

    const headers = body.headers ?? {};
    const isHiddenEngineError = !(
      headers["Date"] ??
      headers["date"] ??
      headers["Content-Type"] ??
      headers["content-type"]
    );

    if (body.errors || body.body?.error || isHiddenEngineError) {
      meta.logger.error("ScrapingBee threw an error", {
        body: body.body?.error ?? body.errors ?? body.body ?? body,
      });
      throw new EngineError("Engine error #34", {
        cause: { body, statusCode: response.status },
      });
    }

    if (typeof body.body !== "string") {
      meta.logger.error("ScrapingBee: Body is not string??", { body });
      throw new EngineError("Engine error #35", {
        cause: { body, statusCode: response.status },
      });
    }

    specialtyScrapeCheck(
      meta.logger.child({
        method: "scrapeURLWithScrapingBee/specialtyScrapeCheck",
      }),
      body.headers,
    );

    return {
      url: body["resolved-url"] ?? meta.url,

      html: body.body,
      error: response.status >= 300 ? response.statusText : undefined,
      statusCode: response.status,
      ...(body.screenshot
        ? {
            screenshot: `data:image/png;base64,${body.screenshot}`,
          }
        : {}),
    };
  };
}
