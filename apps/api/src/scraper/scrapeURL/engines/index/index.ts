import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { getIndexFromGCS, index_supabase_service } from "../../../../services";
import { EngineError, IndexMissError } from "../../error";

export async function scrapeURLWithIndex(meta: Meta): Promise<EngineScrapeResult> { 
    const { data, error } = await index_supabase_service
        .from("pages")
        .select("*")
        .eq("url", meta.url)
        .order("created_at", { ascending: false })
        .limit(1);
    
    if (error) {
        throw new EngineError("Failed to scrape URL with index", {
            cause: error,
        });
    }

    if (data.length === 0) {
        throw new IndexMissError();
    }

    const id = data[0].id;

    const doc = await getIndexFromGCS(id + ".json");
    if (!doc) {
        throw new EngineError("No document found in index");
    }

    return {
        url: doc.url,
        html: doc.html,
        statusCode: doc.statusCode,
        error: doc.error,
        screenshot: doc.screenshot,
        markdown: doc.markdown,
        numPages: doc.numPages,
    };
}
