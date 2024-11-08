import { Logger } from "winston";
import { Meta } from "../..";
import { fireEngineScrape, FireEngineScrapeRequestChromeCDP, FireEngineScrapeRequestCommon, FireEngineScrapeRequestPlaywright, FireEngineScrapeRequestTLSClient } from "./scrape";
import { EngineScrapeResult } from "..";
import { fireEngineCheckStatus, FireEngineCheckStatusSuccess, StillProcessingError } from "./checkStatus";
import { EngineError, TimeoutError } from "../../error";
import * as Sentry from "@sentry/node";
import { Action } from "../../../../lib/entities";
import { specialtyScrapeCheck } from "../utils/specialtyHandler";

const defaultTimeout = 10000;

// This function does not take `Meta` on purpose. It may not access any
// meta values to construct the request -- that must be done by the
// `scrapeURLWithFireEngine*` functions.
async function performFireEngineScrape<Engine extends FireEngineScrapeRequestChromeCDP | FireEngineScrapeRequestPlaywright | FireEngineScrapeRequestTLSClient>(
    logger: Logger,
    request: FireEngineScrapeRequestCommon & Engine,
    timeout = defaultTimeout,
): Promise<FireEngineCheckStatusSuccess> {
    const scrape = await fireEngineScrape(logger.child({ method: "fireEngineScrape" }), request);

    const startTime = Date.now();
    const errorLimit = 3;
    let errors: any[] = [];
    let status: FireEngineCheckStatusSuccess | undefined = undefined;

    while (status === undefined) {
        if (errors.length >= errorLimit) {
            logger.error("Error limit hit.", { errors });
            throw new Error("Error limit hit. See e.cause.errors for errors.", { cause: { errors } });
        }

        if (Date.now() - startTime > timeout) {
            logger.info("Fire-engine was unable to scrape the page before timing out.", { errors, timeout });
            throw new TimeoutError("Fire-engine was unable to scrape the page before timing out", { cause: { errors, timeout } });
        }

        try {
            status = await fireEngineCheckStatus(logger.child({ method: "fireEngineCheckStatus" }), scrape.jobId)
        } catch (error) {
            if (error instanceof StillProcessingError) {
                logger.debug("Scrape is still processing...");
            } else if (error instanceof EngineError) {
                logger.debug("Fire-engine scrape job failed.", { error, jobId: scrape.jobId });
                throw error;
            } else {
                Sentry.captureException(error);
                errors.push(error);
                logger.debug(`An unexpeceted error occurred while calling checkStatus. Error counter is now at ${errors.length}.`, { error, jobId: scrape.jobId });
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return status;
}

export async function scrapeURLWithFireEngineChromeCDP(meta: Meta): Promise<EngineScrapeResult> {
    const actions: Action[] = [
        // Transform waitFor option into an action (unsupported by chrome-cdp)
        ...(meta.options.waitFor !== 0 ? [{
            type: "wait" as const,
            milliseconds: meta.options.waitFor,
        }] : []),

        // Transform screenshot format into an action (unsupported by chrome-cdp)
        ...(meta.options.formats.includes("screenshot") || meta.options.formats.includes("screenshot@fullPage") ? [{
            type: "screenshot" as const,
            fullPage: meta.options.formats.includes("screenshot@fullPage"),
        }] : []),

        // Include specified actions
        ...(meta.options.actions ?? []),
    ];

    const request: FireEngineScrapeRequestCommon & FireEngineScrapeRequestChromeCDP = {
        url: meta.url,
        engine: "chrome-cdp",
        instantReturn: true,
        skipTlsVerification: meta.options.skipTlsVerification,
        headers: meta.options.headers,
        ...(actions.length > 0 ? ({
            actions,
        }) : {}),
        priority: meta.internalOptions.priority,
        geolocation: meta.options.geolocation,
        mobile: meta.options.mobile,
        // TODO: scrollXPaths
    };

    let response = await performFireEngineScrape(
        meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/callFireEngine", request }),
        request,
    );

    specialtyScrapeCheck(meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/specialtyScrapeCheck" }), response.responseHeaders);

    if (meta.options.formats.includes("screenshot") || meta.options.formats.includes("screenshot@fullPage")) {
        meta.logger.debug("Transforming screenshots from actions into screenshot field", { screenshots: response.screenshots });
        response.screenshot = (response.screenshots ?? [])[0];
        (response.screenshots ?? []).splice(0, 1);
        meta.logger.debug("Screenshot transformation done", { screenshots: response.screenshots, screenshot: response.screenshot });
    }

    if (!response.url) {
        meta.logger.warn("Fire-engine did not return the response's URL", { response, sourceURL: meta.url });
    }

    return {
        url: response.url ?? meta.url,

        html: response.content,
        error: response.pageError,
        statusCode: response.pageStatusCode,

        screenshot: response.screenshot,
        ...(actions.length > 0 ? {
            actions: {
                screenshots: response.screenshots ?? [],
                scrapes: response.actionContent ?? [],
            }
        } : {}),
    };
}

export async function scrapeURLWithFireEnginePlaywright(meta: Meta): Promise<EngineScrapeResult> {
    const request: FireEngineScrapeRequestCommon & FireEngineScrapeRequestPlaywright = {
        url: meta.url,
        engine: "playwright",
        instantReturn: true,

        headers: meta.options.headers,
        priority: meta.internalOptions.priority,
        screenshot: meta.options.formats.includes("screenshot"),
        fullPageScreenshot: meta.options.formats.includes("screenshot@fullPage"),
        wait: meta.options.waitFor,
        geolocation: meta.options.geolocation,
    };

    let response = await performFireEngineScrape(
        meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/callFireEngine", request }),
        request,
    );
    
    specialtyScrapeCheck(meta.logger.child({ method: "scrapeURLWithFireEnginePlaywright/specialtyScrapeCheck" }), response.responseHeaders);

    if (!response.url) {
        meta.logger.warn("Fire-engine did not return the response's URL", { response, sourceURL: meta.url });
    }

    return {
        url: response.url ?? meta.url,

        html: response.content,
        error: response.pageError,
        statusCode: response.pageStatusCode,

        ...(response.screenshots !== undefined && response.screenshots.length > 0 ? ({
            screenshot: response.screenshots[0],
        }) : {}),
    };
}

export async function scrapeURLWithFireEngineTLSClient(meta: Meta): Promise<EngineScrapeResult> {
    const request: FireEngineScrapeRequestCommon & FireEngineScrapeRequestTLSClient = {
        url: meta.url,
        engine: "tlsclient",
        instantReturn: true,

        headers: meta.options.headers,
        priority: meta.internalOptions.priority,

        atsv: meta.internalOptions.atsv,
        geolocation: meta.options.geolocation,
        disableJsDom: meta.internalOptions.v0DisableJsDom,
    };

    let response = await performFireEngineScrape(
        meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/callFireEngine", request }),
        request,
    );

    specialtyScrapeCheck(meta.logger.child({ method: "scrapeURLWithFireEngineTLSClient/specialtyScrapeCheck" }), response.responseHeaders);

    if (!response.url) {
        meta.logger.warn("Fire-engine did not return the response's URL", { response, sourceURL: meta.url });
    }

    return {
        url: response.url ?? meta.url,

        html: response.content,
        error: response.pageError,
        statusCode: response.pageStatusCode,
    };
}
