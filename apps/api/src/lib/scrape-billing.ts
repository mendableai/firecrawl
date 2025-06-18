import { Document, ScrapeOptions } from "../controllers/v1/types";
import { CostTracking } from "./extract/extraction-service";

const creditsPerPDFPage = 1;
const stealthProxyCostBonus = 4;

export async function calculateCreditsToBeBilled(options: ScrapeOptions, document: Document | null, costTracking: CostTracking) {
    if (document === null) {
        // Failure -- check cost tracking if FIRE-1
        let creditsToBeBilled = 0;

        if (options.agent?.model?.toLowerCase() === "fire-1" || options.extract?.agent?.model?.toLowerCase() === "fire-1" || options.jsonOptions?.agent?.model?.toLowerCase() === "fire-1") {
            creditsToBeBilled = Math.ceil((costTracking.toJSON().totalCost ?? 1) * 1800);
        } 
    
        return creditsToBeBilled;
    }

    let creditsToBeBilled = 1; // Assuming 1 credit per document
    if ((options.extract && options.formats?.includes("extract")) || (options.formats?.includes("changeTracking") && options.changeTrackingOptions?.modes?.includes("json"))) {
        creditsToBeBilled = 5;
    }

    if (options.agent?.model?.toLowerCase() === "fire-1" || options.extract?.agent?.model?.toLowerCase() === "fire-1" || options.jsonOptions?.agent?.model?.toLowerCase() === "fire-1") {
        creditsToBeBilled = Math.ceil((costTracking.toJSON().totalCost ?? 1) * 1800);
    } 
    
    if (document.metadata.numPages !== undefined && document.metadata.numPages > 1) {
        creditsToBeBilled += creditsPerPDFPage * (document.metadata.numPages - 1);
    }

    if (document?.metadata?.proxyUsed === "stealth") {
        creditsToBeBilled += stealthProxyCostBonus;
    }

    return creditsToBeBilled;
}