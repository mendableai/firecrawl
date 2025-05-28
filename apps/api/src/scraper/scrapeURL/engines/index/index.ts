import { Document } from "../../../../controllers/v1/types";
import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { getIndexFromGCS, index_supabase_service, saveIndexToGCS } from "../../../../services";
import { EngineError, IndexMissError } from "../../error";
import crypto from "crypto";

export const useIndex =
    process.env.INDEX_SUPABASE_URL !== "" &&
    process.env.INDEX_SUPABASE_URL !== undefined;

function normalizeURLForIndex(url: string): string {
    const urlObj = new URL(url);
    urlObj.hash = "";
    urlObj.protocol = "https";

    if (urlObj.port === "80" || urlObj.port === "443") {
        urlObj.port = "";
    }

    if (urlObj.pathname.endsWith("/index.html")) {
        urlObj.pathname = urlObj.pathname.slice(0, -10);
    } else if (urlObj.pathname.endsWith("/index.php")) {
        urlObj.pathname = urlObj.pathname.slice(0, -9);
    } else if (urlObj.pathname.endsWith("/index.htm")) {
        urlObj.pathname = urlObj.pathname.slice(0, -9);
    } else if (urlObj.pathname.endsWith("/index.shtml")) {
        urlObj.pathname = urlObj.pathname.slice(0, -11);
    } else if (urlObj.pathname.endsWith("/index.xml")) {
        urlObj.pathname = urlObj.pathname.slice(0, -9);
    }

    if (urlObj.pathname.endsWith("/")) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
    }

    return urlObj.toString();
}

async function hashURL(url: string): Promise<string> {
    return "\\x" + crypto.createHash("sha256").update(url).digest("hex");
}

export async function sendDocumentToIndex(meta: Meta, document: Document) {
    if (meta.winnerEngine === "cache" || meta.winnerEngine === "index") {
        return document;
    }

    if (meta.featureFlags.has("actions")) {
        return document;
    }

    const normalizedURL = normalizeURLForIndex(meta.url);
    const urlHash = await hashURL(normalizedURL);

    const urlSplits = []; // TODO
    const urlSplitsHash = await Promise.all(urlSplits.map(split => hashURL(split)));

    const indexId = crypto.randomUUID();

    try {
        await saveIndexToGCS(indexId, {
            url: normalizedURL,
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

    const { error } = await index_supabase_service
        .from("index")
        .insert({
            id: indexId,
            url: normalizedURL,
            url_hash: urlHash,
            url_splits: urlSplits,
            url_splits_hash: urlSplitsHash,
        });

    if (error) {
        meta.logger.error("Failed to save document to index", {
            error,
        });
        return document;
    }

    return document;
}

export async function scrapeURLWithIndex(meta: Meta): Promise<EngineScrapeResult> {
    const normalizedURL = normalizeURLForIndex(meta.url);
    const urlHash = await hashURL(normalizedURL);

    const { data, error } = await index_supabase_service
        .from("index")
        .select("id, created_at")
        .eq("url_hash", urlHash)
        .gte("created_at", new Date(Date.now() - meta.options.maxAge).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
    
    if (error) {
        throw new EngineError("Failed to retrieve URL from DB index", {
            cause: error,
        });
    }

    if (data.length === 0) {
        throw new IndexMissError();
    }

    const id = data[0].id;

    const doc = await getIndexFromGCS(id + ".json");
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
        }
    };
}
