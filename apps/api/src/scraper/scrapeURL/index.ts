import { Logger } from "winston";
import * as Sentry from "@sentry/node";

import { Document, ScrapeOptions, TimeoutSignal, TeamFlags } from "../../controllers/v1/types";
import { logger as _logger, logger } from "../../lib/logger";
import {
  buildFallbackList,
  Engine,
  EngineScrapeResult,
  FeatureFlag,
  scrapeURLWithEngine,
} from "./engines";
import { parseMarkdown } from "../../lib/html-to-markdown";
import {
  ActionError,
  AddFeatureError,
  EngineError,
  NoEnginesLeftError,
  PDFAntibotError,
  RemoveFeatureError,
  SiteError,
  TimeoutError,
  UnsupportedFileError,
  SSLError,
  PDFInsufficientTimeError,
  IndexMissError,
  DNSResolutionError,
  ZDRViolationError,
  PDFPrefetchFailed,
  FEPageLoadFailed,
} from "./error";
import { executeTransformers } from "./transformers";
import { LLMRefusalError } from "./transformers/llmExtract";
import { urlSpecificParams } from "./lib/urlSpecificParams";
import { loadMock, MockState } from "./lib/mock";
import { CostTracking } from "../../lib/extract/extraction-service";
import { addIndexRFInsertJob, generateDomainSplits, hashURL, index_supabase_service, normalizeURLForIndex, useIndex } from "../../services/index";
import { checkRobotsTxt } from "../../lib/robots-txt";

export type ScrapeUrlResponse = (
  | {
      success: true;
      document: Document;
    }
  | {
      success: false;
      error: any;
    }
) & {
  logs: any[];
  engines: EngineResultsTracker;
};

export type Meta = {
  id: string;
  url: string;
  rewrittenUrl?: string;
  options: ScrapeOptions;
  internalOptions: InternalOptions;
  logger: Logger;
  logs: any[];
  featureFlags: Set<FeatureFlag>;
  mock: MockState | null;
  pdfPrefetch: {
    filePath: string;
    url?: string;
    status: number;
    proxyUsed: "basic" | "stealth";
  } | null | undefined; // undefined: no prefetch yet, null: prefetch came back empty
  costTracking: CostTracking;
  winnerEngine?: Engine;
  results: EngineResultsTracker;
};

function buildFeatureFlags(
  url: string,
  options: ScrapeOptions,
  internalOptions: InternalOptions,
): Set<FeatureFlag> {
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

  if (internalOptions.atsv) {
    flags.add("atsv");
  }

  if (options.location || options.geolocation) {
    flags.add("location");
  }

  if (options.mobile) {
    flags.add("mobile");
  }

  if (options.skipTlsVerification) {
    flags.add("skipTlsVerification");
  }

  if (options.fastMode) {
    flags.add("useFastMode");
  }

  if (options.proxy === "stealth") {
    flags.add("stealthProxy");
  }

  const urlO = new URL(url);

  if (urlO.pathname.endsWith(".pdf")) {
    flags.add("pdf");
  }

  if (urlO.pathname.endsWith(".docx")) {
    flags.add("docx");
  }

  if (options.blockAds === false) {
    flags.add("disableAdblock");
  }

  return flags;
}

// Convenience URL rewrites, "fake redirects" in essence.
// Used to rewrite commonly used non-scrapable URLs to their scrapable equivalents.
function rewriteUrl(url: string): string | undefined {
  if (url.startsWith("https://docs.google.com/document/d/") || url.startsWith("http://docs.google.com/document/d/")) {
    const id = url.match(/\/document\/d\/([-\w]+)/)?.[1];
    if (id) {
      return `https://docs.google.com/document/d/${id}/export?format=pdf`;
    }
  } else if (url.startsWith("https://docs.google.com/presentation/d/") || url.startsWith("http://docs.google.com/presentation/d/")) {
    const id = url.match(/\/presentation\/d\/([-\w]+)/)?.[1];
    if (id) {
      return `https://docs.google.com/presentation/d/${id}/export?format=pdf`;
    }
  }

  return undefined;
}

// The meta object contains all required information to perform a scrape.
// For example, the scrape ID, URL, options, feature flags, logs that occur while scraping.
// The meta object is usually immutable, except for the logs array, and in edge cases (e.g. a new feature is suddenly required)
// Having a meta object that is treated as immutable helps the code stay clean and easily tracable,
// while also retaining the benefits that WebScraper had from its OOP design.
async function buildMetaObject(
  id: string,
  url: string,
  options: ScrapeOptions,
  internalOptions: InternalOptions,
  costTracking: CostTracking,
): Promise<Meta> {
  const specParams =
    urlSpecificParams[new URL(url).hostname.replace(/^www\./, "")];
  if (specParams !== undefined) {
    options = Object.assign(options, specParams.scrapeOptions);
    internalOptions = Object.assign(
      internalOptions,
      specParams.internalOptions,
    );
  }

  const logger = _logger.child({
    module: "ScrapeURL",
    scrapeId: id,
    scrapeURL: url,
    zeroDataRetention: internalOptions.zeroDataRetention,
  });
  const logs: any[] = [];

  return {
    id,
    url,
    rewrittenUrl: rewriteUrl(url),
    options,
    internalOptions,
    logger,
    logs,
    featureFlags: buildFeatureFlags(url, options, internalOptions),
    mock:
      options.useMock !== undefined
        ? await loadMock(options.useMock, _logger)
        : null,
    pdfPrefetch: undefined,
    costTracking,
    results: {},
  };
}

export type InternalOptions = {
  teamId: string;

  priority?: number; // Passed along to fire-engine
  forceEngine?: Engine | Engine[];
  atsv?: boolean; // anti-bot solver, beta

  v0CrawlOnlyUrls?: boolean;
  v0DisableJsDom?: boolean;
  disableSmartWaitCache?: boolean; // Passed along to fire-engine
  isBackgroundIndex?: boolean;
  abort?: AbortSignal;
  urlInvisibleInCurrentCrawl?: boolean;
  unnormalizedSourceURL?: string;

  saveScrapeResultToGCS?: boolean; // Passed along to fire-engine
  bypassBilling?: boolean;
  zeroDataRetention?: boolean;
  teamFlags?: TeamFlags;
};

export type EngineResultsTracker = {
  [E in Engine]?: (
    | {
        state: "error";
        error: any;
        unexpected: boolean;
      }
    | {
        state: "success";
        result: EngineScrapeResult & { markdown: string };
        factors: Record<string, boolean>;
        unsupportedFeatures: Set<FeatureFlag>;
      }
    | {
        state: "timeout";
      }
  ) & {
    startedAt: number;
    finishedAt: number;
  };
};

export type EngineScrapeResultWithContext = {
  engine: Engine;
  unsupportedFeatures: Set<FeatureFlag>;
  result: EngineScrapeResult & { markdown: string };
};

function safeguardCircularError<T>(error: T): T {
  if (typeof error === "object" && error !== null && (error as any).results) {
    const newError = structuredClone(error);
    delete (newError as any).results;
    return newError;
  } else {
    return error;
  }
}

async function scrapeURLLoop(meta: Meta): Promise<ScrapeUrlResponse> {
  meta.logger.info(`Scraping URL ${JSON.stringify(meta.rewrittenUrl ?? meta.url)}...`);

  if (meta.internalOptions.zeroDataRetention) {
    if (meta.featureFlags.has("screenshot")) {
      throw new ZDRViolationError("screenshot");
    }

    if (meta.featureFlags.has("screenshot@fullScreen")) {
      throw new ZDRViolationError("screenshot@fullScreen");
    }

    if (meta.options.actions && meta.options.actions.find(x => x.type === "screenshot")) {
      throw new ZDRViolationError("screenshot action");
    }

    if (meta.options.actions && meta.options.actions.find(x => x.type === "pdf")) {
      throw new ZDRViolationError("pdf action");
    }
  }

  // TODO: handle sitemap data, see WebScraper/index.ts:280
  // TODO: ScrapeEvents

  const fallbackList = buildFallbackList(meta);

  let result: EngineScrapeResultWithContext | null = null;

  const timeToRun =
    meta.options.timeout !== undefined
      ? Math.round(meta.options.timeout / Math.min(fallbackList.length, 2))
      : (!meta.options.actions && !meta.options.jsonOptions && !meta.options.extract)
        ? Math.round(120000 / Math.min(fallbackList.length, 2))
        : undefined;

  for (const { engine, unsupportedFeatures } of fallbackList) {
    meta.internalOptions.abort?.throwIfAborted();
    const startedAt = Date.now();
    try {
      meta.logger.info("Scraping via " + engine + "...");
      const _engineResult = await scrapeURLWithEngine(meta, engine, timeToRun);
      if (_engineResult.markdown === undefined) {
        // Some engines emit Markdown directly.
        _engineResult.markdown = await parseMarkdown(_engineResult.html);
      }
      const engineResult = _engineResult as EngineScrapeResult & {
        markdown: string;
      };

      // Success factors
      const isLongEnough = engineResult.markdown.length > 0;
      const isGoodStatusCode =
        (engineResult.statusCode >= 200 && engineResult.statusCode < 300) ||
        engineResult.statusCode === 304;
      const hasNoPageError = engineResult.error === undefined;
      const isLikelyProxyError = [401, 403, 429].includes(engineResult.statusCode);

      meta.results[engine] = {
        state: "success",
        result: engineResult,
        factors: { isLongEnough, isGoodStatusCode, hasNoPageError, isLikelyProxyError },
        unsupportedFeatures,
        startedAt,
        finishedAt: Date.now(),
      };

      if (isLikelyProxyError && meta.options.proxy === "auto" && !meta.featureFlags.has("stealthProxy")) {
        meta.logger.info("Scrape via " + engine + " deemed unsuccessful due to proxy inadequacy. Adding stealthProxy flag.");
        throw new AddFeatureError(["stealthProxy"]);
      }

      // NOTE: TODO: what to do when status code is bad is tough...
      // we cannot just rely on text because error messages can be brief and not hit the limit
      // should we just use all the fallbacks and pick the one with the longest text? - mogery
      if (isLongEnough || !isGoodStatusCode) {
        meta.logger.info("Scrape via " + engine + " deemed successful.", {
          factors: { isLongEnough, isGoodStatusCode, hasNoPageError },
        });
        result = {
          engine,
          unsupportedFeatures,
          result: engineResult as EngineScrapeResult & { markdown: string },
        };
        meta.winnerEngine = engine;
        break;
      }
    } catch (error) {
      if (error instanceof EngineError) {
        meta.logger.warn("Engine " + engine + " could not scrape the page.", {
          error,
        });
        meta.results[engine] = {
          state: "error",
          error: safeguardCircularError(error),
          unexpected: false,
          startedAt,
          finishedAt: Date.now(),
        };
      } else if (error instanceof IndexMissError) {
        meta.logger.info("Engine " + engine + " could not find the page in the index.", {
          error,
        });
        meta.results[engine] = {
          state: "error",
          error: safeguardCircularError(error),
          unexpected: false,
          startedAt,
          finishedAt: Date.now(),
        };
      } else if (error instanceof TimeoutError || (error instanceof Error && error.name === "TimeoutError")) {
        meta.logger.info("Engine " + engine + " timed out while scraping.", {
          error,
        });
        meta.results[engine] = {
          state: "timeout",
          startedAt,
          finishedAt: Date.now(),
        };
      } else if (
        error instanceof AddFeatureError ||
        error instanceof RemoveFeatureError
      ) {
        throw error;
      } else if (error instanceof LLMRefusalError) {
        meta.results[engine] = {
          state: "error",
          error: safeguardCircularError(error),
          unexpected: true,
          startedAt,
          finishedAt: Date.now(),
        };
        error.results = meta.results;
        meta.logger.warn("LLM refusal encountered", { error });
        throw error;
      } else if (error instanceof SiteError) {
        throw error;
      } else if (error instanceof SSLError) {
        throw error;
      } else if (error instanceof DNSResolutionError) {
        throw error;
      } else if (error instanceof ActionError) {
        throw error;
      } else if (error instanceof UnsupportedFileError) {
        throw error;
      } else if (error instanceof PDFAntibotError) {
        throw error;
      } else if (error instanceof TimeoutSignal) {
        throw error;
      } else if (error instanceof PDFInsufficientTimeError) {
        throw error;
      } else if (error instanceof FEPageLoadFailed) {
        meta.results[engine] = {
          state: "error",
          error,
          unexpected: false,
          startedAt,
          finishedAt: Date.now(),
        };
      } else {
        Sentry.captureException(error);
        meta.logger.warn(
          "An unexpected error happened while scraping with " + engine + ".",
          { error },
        );
        meta.results[engine] = {
          state: "error",
          error: safeguardCircularError(error),
          unexpected: true,
          startedAt,
          finishedAt: Date.now(),
        };
      }
    }
  }

  if (result === null) {
    if (Object.values(meta.results).every(x => x.state === "timeout")) {
      throw new TimeoutSignal();
    } else {
      throw new NoEnginesLeftError(
        fallbackList.map((x) => x.engine),
        meta.results,
      );
    }
  }

  let document: Document = {
    markdown: result.result.markdown,
    rawHtml: result.result.html,
    screenshot: result.result.screenshot,
    actions: result.result.actions,
    metadata: {
      sourceURL: meta.internalOptions.unnormalizedSourceURL ?? meta.url,
      url: result.result.url,
      statusCode: result.result.statusCode,
      error: result.result.error,
      numPages: result.result.numPages,
      contentType: result.result.contentType,
      proxyUsed: meta.featureFlags.has("stealthProxy") ? "stealth" : "basic",
      ...((meta.results["index"] || meta.results["index;documents"]) ? (
        result.result.cacheInfo ? {
          cacheState: "hit",
          cachedAt: result.result.cacheInfo.created_at.toISOString(),
        } : {
          cacheState: "miss",
        }
      ) : {})
    },
  };

  if (result.unsupportedFeatures.size > 0) {
    const warning = `The engine used does not support the following features: ${[...result.unsupportedFeatures].join(", ")} -- your scrape may be partial.`;
    meta.logger.warn(warning, {
      engine: result.engine,
      unsupportedFeatures: result.unsupportedFeatures,
    });
    document.warning =
      document.warning !== undefined
        ? document.warning + " " + warning
        : warning;
  }

  document = await executeTransformers(meta, document);

  return {
    success: true,
    document,
    logs: meta.logs,
    engines: meta.results,
  };
}

export async function scrapeURL(
  id: string,
  url: string,
  options: ScrapeOptions,
  internalOptions: InternalOptions,
  costTracking: CostTracking,
): Promise<ScrapeUrlResponse> {
  const meta = await buildMetaObject(id, url, options, internalOptions, costTracking);

  if (meta.rewrittenUrl) {
    meta.logger.info("Rewriting URL");
  }

  if (internalOptions.teamFlags?.checkRobotsOnScrape) {
    meta.logger.info("Checking robots.txt", {
      checkRobotsOnScrape: internalOptions.teamFlags?.checkRobotsOnScrape,
      url: meta.rewrittenUrl || meta.url,
    });
    const urlToCheck = meta.rewrittenUrl || meta.url;
    const isAllowed = await checkRobotsTxt(
      urlToCheck, 
      options.skipTlsVerification, 
      meta.logger,
      internalOptions.abort
    );

    
    if (!isAllowed) {
      meta.logger.info("URL blocked by robots.txt", { url: urlToCheck });
      return {
        success: false,
        error: new Error("URL blocked by robots.txt"),
        logs: meta.logs,
        engines: meta.results,
      };
    }
  }

  const shouldRecordFrequency = useIndex
    && meta.options.storeInCache
    && !meta.internalOptions.zeroDataRetention
    && internalOptions.teamId !== process.env.PRECRAWL_TEAM_ID;
  if (shouldRecordFrequency) {
    (async () => {
      try {
        meta.logger.info("Recording frequency");
        const normalizedURL = normalizeURLForIndex(meta.url);
        const urlHash = hashURL(normalizedURL);

        let { data, error } = await index_supabase_service
          .from("index")
          .select("id, created_at, status")
          .eq("url_hash", urlHash)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          meta.logger.warn("Failed to get age data", { error });
        }

        const age = data?.[0]
          ? Date.now() - new Date(data[0].created_at).getTime()
          : -1;
        
        const domainSplits = generateDomainSplits(new URL(normalizeURLForIndex(meta.url)).hostname);
        const domainHash = hashURL(domainSplits.slice(-1)[0]);

        const out = {
          domain_hash: domainHash,
          url: meta.url,
          age2: age,
        };

        await addIndexRFInsertJob(out);
        meta.logger.info("Recorded frequency", { out });
      } catch (error) {
        meta.logger.warn("Failed to record frequency", { error });
      }
    })();
  } else {
    meta.logger.info("Not recording frequency", {
      useIndex,
      storeInCache: meta.options.storeInCache,
      zeroDataRetention: meta.internalOptions.zeroDataRetention,
    });
  }

  try {
    while (true) {
      try {
        return await scrapeURLLoop(meta);
      } catch (error) {
        if (
          error instanceof AddFeatureError &&
          meta.internalOptions.forceEngine === undefined
        ) {
          meta.logger.debug(
            "More feature flags requested by scraper: adding " +
              error.featureFlags.join(", "),
            { error, existingFlags: meta.featureFlags },
          );
          meta.featureFlags = new Set(
            [...meta.featureFlags].concat(error.featureFlags),
          );
          if (error.pdfPrefetch) {
            meta.pdfPrefetch = error.pdfPrefetch;
          }
        } else if (
          error instanceof RemoveFeatureError &&
          meta.internalOptions.forceEngine === undefined
        ) {
          meta.logger.debug(
            "Incorrect feature flags reported by scraper: removing " +
              error.featureFlags.join(","),
            { error, existingFlags: meta.featureFlags },
          );
          meta.featureFlags = new Set(
            [...meta.featureFlags].filter(
              (x) => !error.featureFlags.includes(x),
            ),
          );
        } else if (
          error instanceof PDFAntibotError &&
          meta.internalOptions.forceEngine === undefined
        ) {
          if (meta.pdfPrefetch !== undefined) {
            meta.logger.error("PDF was prefetched and still blocked by antibot, failing");
            throw error;
          } else {
            meta.logger.debug("PDF was blocked by anti-bot, prefetching with chrome-cdp");
            meta.featureFlags = new Set(
              [...meta.featureFlags].filter(
                (x) => x !== "pdf",
              ),
            );
          }
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    if (Object.values(meta.results).length > 0 && Object.values(meta.results).every(x => x.state === "error" && x.error instanceof FEPageLoadFailed)) {
      throw new FEPageLoadFailed();
    } else if (error instanceof NoEnginesLeftError) {
      meta.logger.warn("scrapeURL: All scraping engines failed!", { error });
    } else if (error instanceof LLMRefusalError) {
      meta.logger.warn("scrapeURL: LLM refused to extract content", { error });
    } else if (
      error instanceof Error &&
      error.message.includes("Invalid schema for response_format")
    ) {
      // TODO: seperate into custom error
      meta.logger.warn("scrapeURL: LLM schema error", { error });
      // TODO: results?
    } else if (error instanceof SiteError) {
      meta.logger.warn("scrapeURL: Site failed to load in browser", { error });
    } else if (error instanceof SSLError) {
      meta.logger.warn("scrapeURL: SSL error", { error });
    } else if (error instanceof ActionError) {
      meta.logger.warn("scrapeURL: Action(s) failed to complete", { error });
    } else if (error instanceof UnsupportedFileError) {
      meta.logger.warn("scrapeURL: Tried to scrape unsupported file", {
        error,
      });
    } else if (error instanceof PDFInsufficientTimeError) {
      meta.logger.warn("scrapeURL: Insufficient time to process PDF", { error });
    } else if (error instanceof PDFPrefetchFailed) {
      meta.logger.warn("scrapeURL: Failed to prefetch PDF that is protected by anti-bot", { error });
    } else if (error instanceof TimeoutSignal) {
      throw error;
    } else {
      Sentry.captureException(error);
      meta.logger.error("scrapeURL: Unexpected error happened", { error });
      // TODO: results?
    }

    return {
      success: false,
      error,
      logs: meta.logs,
      engines: meta.results,
    };
  }
}
