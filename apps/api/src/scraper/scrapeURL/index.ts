import { Logger } from "winston";
import * as Sentry from "@sentry/node";

import { Document, ScrapeOptions } from "../../controllers/v1/types";
import { logger, ArrayTransport } from "../../lib/logger";
import { buildFallbackList, Engine, EngineScrapeResult, scrapeURLWithEngine } from "./engines";
import { parseMarkdown } from "../../lib/html-to-markdown";
import { EngineError, NoEnginesLeftError, TimeoutError } from "./error";
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
}

function buildMetaObject(id: string, url: string, options: ScrapeOptions, internalOptions: InternalOptions): Meta {
    const _logger = logger.child({ module: "ScrapeURL", scrapeId: id });
    const logs: any[] = [];
    _logger.add(new ArrayTransport({ array: logs, scrapeId: id }));

    return {
        id, url, options, internalOptions,
        logger: _logger,
        logs,
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
} };

export async function scrapeURL(
    id: string,
    url: string,
    options: ScrapeOptions,
    internalOptions: InternalOptions = {},
): Promise<ScrapeUrlResponse> {
    const meta = buildMetaObject(id, url, options, internalOptions);

    try {
        meta.logger.info(`Scraping URL ${JSON.stringify(url)}...`, { url, options, internalOptions });
    
        // TODO: take care of PDFs and DOCs/DOCxs, see WebScraper/index.ts:264
        // TODO: handle sitemap data, see WebScraper/index.ts:280
        // TODO: build fallback tree

        const fallbackList = buildFallbackList(meta);

        const results: EngineResultsTracker = {};
        let result: (EngineScrapeResult & { markdown: string }) | null = null;

        for (const engine of fallbackList) {
            try {
                const _engineResult = await scrapeURLWithEngine(meta, "fire-engine;chrome-cdp");
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
                };

                // NOTE: TODO: what to do when status code is bad is tough...
                // we cannot just rely on text because error messages can be brief and not hit the limit
                // should we just use all the fallbacks and pick the one with the longest text? - mogery
                if (isLongEnough || !isGoodStatusCode) {
                    meta.logger.info("Scrape via " + engine + " deemed successful.", { factors: { isLongEnough, isGoodStatusCode, hasNoPageError }, engineResult });
                    result = engineResult as EngineScrapeResult & { markdown: string };
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
                } else {
                    meta.logger.debug("An unexpected error happened while scraping with " + engine + ".", { error });
                    results[engine] = {
                        state: "error",
                        error,
                        unexpected: true,
                    }
                }
            }
        }

        if (result === null) {
            throw new NoEnginesLeftError(fallbackList, results);
        }

        let document: Document = {
            markdown: result.markdown,
            rawHtml: result.html,
            metadata: {
                sourceURL: meta.url,
                statusCode: result.statusCode,
                error: result.error,
            },
        }

        document = await executeTransformers(meta, document);

        return {
            success: true,
            document,
            logs: meta.logs,
        };
    } catch (error) {
        if (error instanceof NoEnginesLeftError) {
            meta.logger.debug("All scraping engines failed!", { error });
        } else {
            Sentry.captureException(error);
            meta.logger.error("Unexpected error happened ", { error });
        }

        return {
            success: false,
            error,
            logs: meta.logs,
        }
    }
}