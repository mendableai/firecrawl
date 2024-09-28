import { Logger } from "winston";
import { Meta } from "../..";
import { fireEngineScrape, FireEngineScrapeRequestChromeCDP, FireEngineScrapeRequestCommon, FireEngineScrapeRequestPlaywright, FireEngineScrapeRequestTLSClient } from "./scrape";
import { EngineScrapeResult } from "..";
import { fireEngineCheckStatus, FireEngineCheckStatusSuccess, StillProcessingError } from "./checkStatus";
import { EngineError, TimeoutError } from "../../error";
import * as Sentry from "@sentry/node";

const defaultTimeout = 20000;

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
    // TODO: construct wait, screenshot, fullPageScreenshot actions

    const request: FireEngineScrapeRequestCommon & FireEngineScrapeRequestChromeCDP = {
        url: meta.url,
        engine: "chrome-cdp",
        instantReturn: true,

        headers: meta.options.headers,
        
        priority: meta.internalOptions.priority,
        // TODO: atsv, scrollXPaths, actions, instantReturn, disableJsDom
    };

    const response = await performFireEngineScrape(
        meta.logger.child({ method: "scrapeURLWithFireEngineChromeCDP/callFireEngine", request }),
        request,
    );

    return {
        html: response.content,
        error: response.pageError,
        statusCode: response.pageStatusCode,
    };
}
