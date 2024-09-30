import { Logger } from "winston";
import * as Sentry from "@sentry/node";

import { Document, ScrapeOptions } from "../../controllers/v1/types";
import { logger, ArrayTransport } from "../../lib/logger";
import { buildFallbackList, Engine, EngineScrapeResult, FeatureFlag, scrapeURLWithEngine } from "./engines";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { AddFeatureError, EngineError, NoEnginesLeftError, TimeoutError } from "./error";
import { executeTransformers } from "./transformers";

type ScrapeUrlResponse = ({
    success: true,
    document: Document,
} | {
    success: false,
    error: any,
}) & {
    logs: any[],
}

export type Meta = {
    id: string;
    url: string;
    options: ScrapeOptions;
    internalOptions: InternalOptions;
    logger: Logger;
    logs: any[];
    featureFlags: Set<FeatureFlag>;
}

function buildFeatureFlags(url: string, options: ScrapeOptions, internalOptions: InternalOptions): Set<FeatureFlag> {
    const flags: Set<FeatureFlag> = new Set();

    if (options.actions !== undefined) {
        flags.add("actions");
    }

    if (options.formats.includes("screenshot")) {
        flags.add("screenshot");
    }

    if (options.formats.includes("screenshot@fullPage")) {
        flags.add("screenshot@fullScreen");
    }

    if (options.waitFor !== 0) {
        flags.add("waitFor");
    }

    const urlO = new URL(url);

    if (urlO.pathname.endsWith(".pdf")) {
        flags.add("pdf");
    }

    if (urlO.pathname.endsWith(".docx")) {
        flags.add("docx");
    }

    return flags;
}

function buildMetaObject(id: string, url: string, options: ScrapeOptions, internalOptions: InternalOptions): Meta {
    const _logger = logger.child({ module: "ScrapeURL", scrapeId: id });
    const logs: any[] = [];
    _logger.add(new ArrayTransport({ array: logs, scrapeId: id }));

    return {
        id, url, options, internalOptions,
        logger: _logger,
        logs,
        featureFlags: buildFeatureFlags(url, options, internalOptions),
    };
}

export type InternalOptions = {
    priority?: number; // Passed along to fire-engine
};

export type EngineResultsTracker = { [E in Engine]?: {
    state: "error",
    error: any,
    unexpected: boolean,
} | {
    state: "success",
    result: EngineScrapeResult & { markdown: string },
    factors: Record<string, boolean>,
    unsupportedFeatures: Set<FeatureFlag>,
} | {
    state: "timeout",
} };

export type EngineScrapeResultWithContext = {
    engine: Engine,
    unsupportedFeatures: Set<FeatureFlag>,
    result: (EngineScrapeResult & { markdown: string }),
};

async function scrapeURLLoop(
    meta: Meta
): Promise<ScrapeUrlResponse> {
    meta.logger.info(`Scraping URL ${JSON.stringify(meta.url)}...`,);

    // TODO: handle sitemap data, see WebScraper/index.ts:280

    const fallbackList = buildFallbackList(meta);

    const results: EngineResultsTracker = {};
    let result: EngineScrapeResultWithContext | null = null;

    for (const { engine, unsupportedFeatures } of fallbackList) {
        try {
            const _engineResult = await scrapeURLWithEngine(meta, engine);
            if (_engineResult.markdown === undefined) { // Some engines emit Markdown directly.
                _engineResult.markdown = await parseMarkdown(_engineResult.html);
            }
            const engineResult = _engineResult as EngineScrapeResult & { markdown: string };

            // Success factors
            const isLongEnough = engineResult.markdown.length >= 100;
            const isGoodStatusCode = engineResult.statusCode < 300;
            const hasNoPageError = engineResult.error === undefined;

            results[engine] = {
                state: "success",
                result: engineResult,
                factors: { isLongEnough, isGoodStatusCode, hasNoPageError },
                unsupportedFeatures,
            };

            // NOTE: TODO: what to do when status code is bad is tough...
            // we cannot just rely on text because error messages can be brief and not hit the limit
            // should we just use all the fallbacks and pick the one with the longest text? - mogery
            if (isLongEnough || !isGoodStatusCode) {
                meta.logger.info("Scrape via " + engine + " deemed successful.", { factors: { isLongEnough, isGoodStatusCode, hasNoPageError }, engineResult });
                result = {
                    engine,
                    unsupportedFeatures,
                    result: engineResult as EngineScrapeResult & { markdown: string }
                };
                break;
            }
        } catch (error) {
            if (error instanceof EngineError) {
                meta.logger.debug("Engine " + engine + " could not scrape the page.", { error });
                results[engine] = {
                    state: "error",
                    error,
                    unexpected: false,
                };
            } else if (error instanceof TimeoutError) {
                meta.logger.debug("Engine " + engine + " timed out while scraping.", { error });
                results[engine] = {
                    state: "timeout",
                };
            } else if (error instanceof AddFeatureError) {
                throw error;
            } else {
                Sentry.captureException(error);
                meta.logger.error("An unexpected error happened while scraping with " + engine + ".", { error });
                results[engine] = {
                    state: "error",
                    error,
                    unexpected: true,
                }
            }
        }
    }

    if (result === null) {
        throw new NoEnginesLeftError(fallbackList.map(x => x.engine), results);
    }

    let document: Document = {
        markdown: result.result.markdown,
        rawHtml: result.result.html,
        screenshot: result.result.screenshot,
        actions: result.result.actions,
        metadata: {
            sourceURL: meta.url,
            url: result.result.url,
            statusCode: result.result.statusCode,
            error: result.result.error,
        },
    }

    // TODO: add warning when final scraper has feature set mismatch
    document = await executeTransformers(meta, document);

    return {
        success: true,
        document,
        logs: meta.logs,
    };
}

export async function scrapeURL(
    id: string,
    url: string,
    options: ScrapeOptions,
    internalOptions: InternalOptions = {},
): Promise<ScrapeUrlResponse> {
    const meta = buildMetaObject(id, url, options, internalOptions);
    try {
        while (true) {
            try {
                return await scrapeURLLoop(meta);
            } catch (error) {
                if (error instanceof AddFeatureError) {
                    meta.logger.debug("More feature flags requested by scraper: adding " + error.featureFlags.join(", "), { error, existingFlags: meta.featureFlags });
                    meta.featureFlags = new Set([...meta.featureFlags].concat(error.featureFlags));
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        if (error instanceof NoEnginesLeftError) {
            meta.logger.warn("scrapeURL: All scraping engines failed!", { error });
        } else {
            Sentry.captureException(error);
            meta.logger.error("scrapeURL: Unexpected error happened", { error });
        }

        return {
            success: false,
            error,
            logs: meta.logs,
        }
    }
}