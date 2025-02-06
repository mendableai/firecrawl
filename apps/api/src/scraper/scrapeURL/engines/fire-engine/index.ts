import { Logger } from "winston";
import { Meta } from "../..";
import {
  fireEngineScrape,
  FireEngineScrapeRequestChromeCDP,
  FireEngineScrapeRequestCommon,
  FireEngineScrapeRequestPlaywright,
  FireEngineScrapeRequestTLSClient,
} from "./scrape";
import { EngineScrapeResult } from "..";
import {
  fireEngineCheckStatus,
  FireEngineCheckStatusSuccess,
  StillProcessingError,
} from "./checkStatus";
import {
  ActionError,
  EngineError,
  SiteError,
  TimeoutError,
  UnsupportedFileError,
} from "../../error";
import * as Sentry from "@sentry/node";
import { Action } from "../../../../lib/entities";
import { specialtyScrapeCheck } from "../utils/specialtyHandler";
import { fireEngineDelete } from "./delete";
import { MockState, saveMock } from "../../lib/mock";
import { getInnerJSON } from "../../../../lib/html-transformer";

// This function does not take `Meta` on purpose. It may not access any
// meta values to construct the request -- that must be done by the
// `scrapeURLWithFireEngine*` functions.
async function performFireEngineScrape<
  Engine extends
    | FireEngineScrapeRequestChromeCDP
    | FireEngineScrapeRequestPlaywright
    | FireEngineScrapeRequestTLSClient,
>(
  logger: Logger,
  request: FireEngineScrapeRequestCommon & Engine,
  timeout: number,
  mock: MockState | null,
): Promise<FireEngineCheckStatusSuccess> {
  const scrape = await fireEngineScrape(
    logger.child({ method: "fireEngineScrape" }),
    request,
    mock,
  );

  const startTime = Date.now();
  const errorLimit = 3;
  let errors: any[] = [];
  let status: FireEngineCheckStatusSuccess | undefined = undefined;

  while (status === undefined) {
    if (errors.length >= errorLimit) {
      logger.error("Error limit hit.", { errors });
      fireEngineDelete(
        logger.child({
          method: "performFireEngineScrape/fireEngineDelete",
          afterErrors: errors,
        }),
        scrape.jobId,
        mock,
      );
      throw new Error("Error limit hit. See e.cause.errors for errors.", {
        cause: { errors },
      });
    }

    if (Date.now() - startTime > timeout) {
      logger.info(
        "Fire-engine was unable to scrape the page before timing out.",
        { errors, timeout },
      );
      throw new TimeoutError(
        "Fire-engine was unable to scrape the page before timing out",
        { cause: { errors, timeout } },
      );
    }

    try {
      status = await fireEngineCheckStatus(
        logger.child({ method: "fireEngineCheckStatus" }),
        scrape.jobId,
        mock,
      );
    } catch (error) {
      if (error instanceof StillProcessingError) {
        // nop
      } else if (
        error instanceof EngineError ||
        error instanceof SiteError ||
        error instanceof ActionError ||
        error instanceof UnsupportedFileError
      ) {
        fireEngineDelete(
          logger.child({
            method: "performFireEngineScrape/fireEngineDelete",
            afterError: error,
          }),
          scrape.jobId,
          mock,
        );
        logger.debug("Fire-engine scrape job failed.", {
          error,
          jobId: scrape.jobId,
        });
        throw error;
      } else {
        Sentry.captureException(error);
        errors.push(error);
        logger.debug(
          `An unexpeceted error occurred while calling checkStatus. Error counter is now at ${errors.length}.`,
          { error, jobId: scrape.jobId },
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  specialtyScrapeCheck(
    logger.child({
      method: "performFireEngineScrape/specialtyScrapeCheck",
    }),
    status.responseHeaders,
  );

  const contentType = (Object.entries(status.responseHeaders ?? {}).find(
    (x) => x[0].toLowerCase() === "content-type",
  ) ?? [])[1] ?? "";

  if (contentType.includes("application/json")) {
    status.content = await getInnerJSON(status.content);
  }

  if (status.file) {
    const content = status.file.content;
    delete status.file;
    status.content = Buffer.from(content, "base64").toString("utf8"); // TODO: handle other encodings via Content-Type tag
  }

  fireEngineDelete(
    logger.child({
      method: "performFireEngineScrape/fireEngineDelete",
    }),
    scrape.jobId,
    mock,
  );

  return status;
}

export async function scrapeURLWithFireEngineChromeCDP(
  meta: Meta,
  timeToRun: number | undefined,
): Promise<EngineScrapeResult> {
  const actions: Action[] = [
    // Transform waitFor option into an action (unsupported by chrome-cdp)
    ...(meta.options.waitFor !== 0
      ? [
          { 
            type: "wait" as const,
            milliseconds: meta.options.waitFor > 30000 ? 30000 : meta.options.waitFor,
          },
        ]
      : []),

    // Transform screenshot format into an action (unsupported by chrome-cdp)
    ...(meta.options.formats.includes("screenshot") ||
    meta.options.formats.includes("screenshot@fullPage")
      ? [
          {
            type: "screenshot" as const,
            fullPage: meta.options.formats.includes("screenshot@fullPage"),
          },
        ]
      : []),

    // Include specified actions
    ...(meta.options.actions ?? []),
  ];

  const totalWait = actions.reduce(
    (a, x) => (x.type === "wait" ? (x.milliseconds ?? 1000) + a : a),
    0,
  );

  const timeout = (timeToRun ?? 300000) + totalWait;

  const request: FireEngineScrapeRequestCommon &
    FireEngineScrapeRequestChromeCDP = {
    url: meta.url,
    engine: "chrome-cdp",
    instantReturn: true,
    skipTlsVerification: meta.options.skipTlsVerification,
    headers: meta.options.headers,
    ...(actions.length > 0
      ? {
          actions,
        }
      : {}),
    priority: meta.internalOptions.priority,
    geolocation: meta.options.geolocation ?? meta.options.location,
    mobile: meta.options.mobile,
    timeout, // TODO: better timeout logic
    disableSmartWaitCache: meta.internalOptions.disableSmartWaitCache,
    blockAds: meta.options.blockAds,
    // TODO: scrollXPaths
  };

  let response = await performFireEngineScrape(
    meta.logger.child({
      method: "scrapeURLWithFireEngineChromeCDP/callFireEngine",
      request,
    }),
    request,
    timeout,
    meta.mock,
  );

  if (
    meta.options.formats.includes("screenshot") ||
    meta.options.formats.includes("screenshot@fullPage")
  ) {
    meta.logger.debug(
      "Transforming screenshots from actions into screenshot field",
      { screenshots: response.screenshots },
    );
    response.screenshot = (response.screenshots ?? [])[0];
    (response.screenshots ?? []).splice(0, 1);
    meta.logger.debug("Screenshot transformation done", {
      screenshots: response.screenshots,
      screenshot: response.screenshot,
    });
  }

  if (!response.url) {
    meta.logger.warn("Fire-engine did not return the response's URL", {
      response,
      sourceURL: meta.url,
    });
  }

  return {
    url: response.url ?? meta.url,

    html: response.content,
    error: response.pageError,
    statusCode: response.pageStatusCode,

    screenshot: response.screenshot,
    ...(actions.length > 0
      ? {
          actions: {
            screenshots: response.screenshots ?? [],
            scrapes: response.actionContent ?? [],
          },
        }
      : {}),
  };
}

export async function scrapeURLWithFireEnginePlaywright(
  meta: Meta,
  timeToRun: number | undefined,
): Promise<EngineScrapeResult> {
  const totalWait = meta.options.waitFor;
  const timeout = (timeToRun ?? 300000) + totalWait;

  const request: FireEngineScrapeRequestCommon &
    FireEngineScrapeRequestPlaywright = {
    url: meta.url,
    engine: "playwright",
    instantReturn: true,

    headers: meta.options.headers,
    priority: meta.internalOptions.priority,
    screenshot: meta.options.formats.includes("screenshot"),
    fullPageScreenshot: meta.options.formats.includes("screenshot@fullPage"),
    wait: meta.options.waitFor,
    geolocation: meta.options.geolocation ?? meta.options.location,
    blockAds: meta.options.blockAds,

    timeout,
  };

  let response = await performFireEngineScrape(
    meta.logger.child({
      method: "scrapeURLWithFireEngineChromeCDP/callFireEngine",
      request,
    }),
    request,
    timeout,
    meta.mock,
  );

  if (!response.url) {
    meta.logger.warn("Fire-engine did not return the response's URL", {
      response,
      sourceURL: meta.url,
    });
  }

  return {
    url: response.url ?? meta.url,

    html: response.content,
    error: response.pageError,
    statusCode: response.pageStatusCode,

    ...(response.screenshots !== undefined && response.screenshots.length > 0
      ? {
          screenshot: response.screenshots[0],
        }
      : {}),
  };
}

export async function scrapeURLWithFireEngineTLSClient(
  meta: Meta,
  timeToRun: number | undefined,
): Promise<EngineScrapeResult> {
  const timeout = timeToRun ?? 30000;

  const request: FireEngineScrapeRequestCommon &
    FireEngineScrapeRequestTLSClient = {
    url: meta.url,
    engine: "tlsclient",
    instantReturn: true,

    headers: meta.options.headers,
    priority: meta.internalOptions.priority,

    atsv: meta.internalOptions.atsv,
    geolocation: meta.options.geolocation ?? meta.options.location,
    disableJsDom: meta.internalOptions.v0DisableJsDom,

    timeout,
  };

  let response = await performFireEngineScrape(
    meta.logger.child({
      method: "scrapeURLWithFireEngineChromeCDP/callFireEngine",
      request,
    }),
    request,
    timeout,
    meta.mock,
  );

  if (!response.url) {
    meta.logger.warn("Fire-engine did not return the response's URL", {
      response,
      sourceURL: meta.url,
    });
  }

  return {
    url: response.url ?? meta.url,

    html: response.content,
    error: response.pageError,
    statusCode: response.pageStatusCode,
  };
}
