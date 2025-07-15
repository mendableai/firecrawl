import { Document } from "../../../../controllers/v1/types";
import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { getIndexFromGCS, hashURL, index_supabase_service, normalizeURLForIndex, saveIndexToGCS, generateURLSplits, addIndexInsertJob, generateDomainSplits, addOMCEJob } from "../../../../services";
import { EngineError, IndexMissError, TimeoutError } from "../../error";
import crypto from "crypto";

export async function sendDocumentToIndex(meta: Meta, document: Document) {
    const shouldCache = meta.options.storeInCache
        && !meta.internalOptions.zeroDataRetention
        && meta.winnerEngine !== "index"
        && meta.winnerEngine !== "index;documents"
        && (
            meta.internalOptions.teamId === "sitemap"
            || (
                meta.winnerEngine !== "fire-engine;tlsclient"
                && meta.winnerEngine !== "fire-engine;tlsclient;stealth"
                && meta.winnerEngine !== "fetch"
            )
        )
        && !meta.featureFlags.has("actions")
        && (
            meta.options.headers === undefined
            || Object.keys(meta.options.headers).length === 0
        );

    if (!shouldCache) {
        return document;
    }

    (async () => {
        try {
            const normalizedURL = normalizeURLForIndex(meta.url);
            const urlHash = hashURL(normalizedURL);

            const urlSplits = generateURLSplits(normalizedURL);
            const urlSplitsHash = urlSplits.map(split => hashURL(split));

            const urlObj = new URL(normalizedURL);
            const hostname = urlObj.hostname;

            const domainSplits = generateDomainSplits(hostname);
            const domainSplitsHash = domainSplits.map(split => hashURL(split));

            const indexId = crypto.randomUUID();

            try {
                await saveIndexToGCS(indexId, {
                    url: document.metadata.url ?? document.metadata.sourceURL ?? meta.rewrittenUrl ?? meta.url,
                    html: document.rawHtml!,
                    statusCode: document.metadata.statusCode,
                    error: document.metadata.error,
                    screenshot: document.screenshot,
                    numPages: document.metadata.numPages,
                });
            } catch (error) {
                meta.logger.error("Failed to save document to index", {
                    error,
                });
                return document;
            }

            let title = document.metadata.title ?? document.metadata.ogTitle ?? null;
            let description = document.metadata.description ?? document.metadata.ogDescription ?? document.metadata.dcDescription ?? null;

            if (typeof title === "string") {
                title = title.trim();
                if (title.length > 60) {
                    title = title.slice(0, 57) + "...";
                }
            } else {
                title = null;
            }

            if (typeof description === "string") {
                description = description.trim();
                if (description.length > 160) {
                    description = description.slice(0, 157) + "...";
                }
            } else {
                description = null;
            }

            try {
                await addIndexInsertJob({
                    id: indexId,
                    url: normalizedURL,
                    url_hash: urlHash,
                    original_url: document.metadata.sourceURL ?? meta.url,
                    resolved_url: document.metadata.url ?? document.metadata.sourceURL ?? meta.rewrittenUrl ?? meta.url,
                    has_screenshot: document.screenshot !== undefined && meta.featureFlags.has("screenshot"),
                    has_screenshot_fullscreen: document.screenshot !== undefined && meta.featureFlags.has("screenshot@fullScreen"),
                    is_mobile: meta.options.mobile,
                    block_ads: meta.options.blockAds,
                    location_country: meta.options.location?.country ?? null,
                    location_languages: meta.options.location?.languages ?? null,
                    status: document.metadata.statusCode,
                    ...(urlSplitsHash.slice(0, 10).reduce((a,x,i) => ({
                        ...a,
                        [`url_split_${i}_hash`]: x,
                    }), {})),
                    ...(domainSplitsHash.slice(0, 5).reduce((a,x,i) => ({
                        ...a,
                        [`domain_splits_${i}_hash`]: x,
                    }), {})),
                    ...(title ? { title } : {}),
                    ...(description ? { description } : {}),
                });
            } catch (error) {
                meta.logger.error("Failed to add document to index insert queue", {
                    error,
                });
            }

            if (domainSplits.length > 0) {
                try {
                    await addOMCEJob([domainSplits.length - 1, domainSplitsHash.slice(-1)[0]]);
                } catch (error) {
                    meta.logger.warn("Failed to add domain to OMCE job queue", {
                        error,
                    });
                }
            }
        } catch (error) {
            meta.logger.error("Failed to save document to index (outer)", {
                error,
            });
        }
    })();

    return document;
}

const errorCountToRegister = 3;

export async function scrapeURLWithIndex(meta: Meta, timeToRun: number | undefined): Promise<EngineScrapeResult> {
    const normalizedURL = normalizeURLForIndex(meta.url);
    const urlHash = hashURL(normalizedURL);

    let selector = index_supabase_service
        .from("index")
        .select("id, created_at, status")
        .eq("url_hash", urlHash)
        .gte("created_at", new Date(Date.now() - meta.options.maxAge).toISOString())
        .eq("is_mobile", meta.options.mobile)
        .eq("block_ads", meta.options.blockAds);
    
    if (meta.featureFlags.has("screenshot")) {
        selector = selector.eq("has_screenshot", true);
    }
    if (meta.featureFlags.has("screenshot@fullScreen")) {
        selector = selector.eq("has_screenshot_fullscreen", true);
    }
    if (meta.options.location?.country) {
        selector = selector.eq("location_country", meta.options.location.country);
    } else {
        selector = selector.is("location_country", null);
    }
    if (meta.options.location?.languages) {
        selector = selector.eq("location_languages", meta.options.location.languages);
    } else {
        selector = selector.is("location_languages", null);
    }

    const { data, error } = await Promise.race([
        selector
            .order("created_at", { ascending: false })
            .limit(5),
        new Promise<{ data: { id: any; created_at: any; status: any }[], error: any }>((resolve, reject) => {
            setTimeout(() => reject(new TimeoutError()), timeToRun ?? 10000);
        }),
    ]);

    if (error || !data) {
        throw new EngineError("Failed to retrieve URL from DB index", {
            cause: error,
        });
    }

    let selectedRow: {
        id: string;
        created_at: string;
        status: number;
    } | null = null;

    if (data.length > 0) {
        const newest200Index = data.findIndex(x => x.status >= 200 && x.status < 300);
        // If the newest 200 index is further back than the allowed error count, we should display the errored index entry
        if (newest200Index >= errorCountToRegister || newest200Index === -1) {
            selectedRow = data[0];
        } else {
            selectedRow = data[newest200Index];
        }
    }

    if (selectedRow === null || selectedRow === undefined) {
        throw new IndexMissError();
    }

    const id = data[0].id;

    const doc = await getIndexFromGCS(id + ".json", meta.logger.child({ module: "index", method: "getIndexFromGCS" }));
    if (!doc) {
        throw new EngineError("Document not found in GCS");
    }
    
    return {
        url: doc.url,
        html: doc.html,
        statusCode: doc.statusCode,
        error: doc.error,
        screenshot: doc.screenshot,
        numPages: doc.numPages,

        cacheInfo: {
            created_at: new Date(data[0].created_at),
        },

        proxyUsed: doc.proxyUsed ?? "basic",
    };
}
