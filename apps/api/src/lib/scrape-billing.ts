import { InternalOptions } from "src/scraper/scrapeURL";
import { Document, TeamFlags } from "../controllers/v1/types";
import { ScrapeOptions as V1ScrapeOptions } from "../controllers/v1/types";
import { ScrapeOptions as V2ScrapeOptions } from "../controllers/v2/types";
import { CostTracking } from "./extract/extraction-service";

const creditsPerPDFPage = 1;
const stealthProxyCostBonus = 4;

export async function calculateCreditsToBeBilled(options: V1ScrapeOptions | V2ScrapeOptions, internalOptions: InternalOptions, document: Document | null, costTracking: CostTracking | ReturnType<typeof CostTracking.prototype.toJSON>, flags: TeamFlags) {
    const costTrackingJSON: ReturnType<typeof CostTracking.prototype.toJSON> = costTracking instanceof CostTracking ? costTracking.toJSON() : costTracking;

    if (document === null) {
        // Failure -- check cost tracking if FIRE-1
        let creditsToBeBilled = 0;

        if ((options as any).agent?.model?.toLowerCase() === "fire-1" || (options.extract as any)?.agent?.model?.toLowerCase() === "fire-1") {
            creditsToBeBilled = Math.ceil((costTrackingJSON.totalCost ?? 1) * 1800);
        }
    
        return creditsToBeBilled;
    }

    let creditsToBeBilled = 1; // Assuming 1 credit per document
    
    const hasExtractFormat = options.formats?.some(f => 
        (typeof f === "string" && f === "extract") || 
        (typeof f === "object" && "type" in f && f.type === "extract")
    );
    
    const hasJsonFormat = options.formats?.some(f => 
        (typeof f === "string" && f === "json") || 
        (typeof f === "object" && "type" in f && f.type === "json")
    );
    
    const hasChangeTrackingWithJson = options.formats?.some(f => {
        if (typeof f === "object" && "type" in f && f.type === "changeTracking") {
            return (f as any).modes?.includes("json");
        } else if (typeof f === "string" && f === "changeTracking") {
            return (options as any).changeTrackingOptions?.modes?.includes("json");
        }
        return false;
    });
    
    if ((options.extract && hasExtractFormat) || hasJsonFormat || hasChangeTrackingWithJson) {
        creditsToBeBilled = 5;
    }

    if ((options as any).agent?.model?.toLowerCase() === "fire-1" || (options.extract as any)?.agent?.model?.toLowerCase() === "fire-1") {
        creditsToBeBilled = Math.ceil((costTrackingJSON.totalCost ?? 1) * 1800);
    }

    if (internalOptions.zeroDataRetention) {
        creditsToBeBilled += (flags?.zdrCost ?? 1);
    }
    
    if (options.parsePDF && document.metadata?.numPages !== undefined && document.metadata.numPages > 1) {
        creditsToBeBilled += creditsPerPDFPage * (document.metadata.numPages - 1);
    }

    if (document?.metadata?.proxyUsed === "stealth") {
        creditsToBeBilled += stealthProxyCostBonus;
    }

    return creditsToBeBilled;
}
