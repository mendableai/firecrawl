import { Document, ScrapeOptions } from "../controllers/v1/types";
import { supabaseGetJobById } from "./supabase-jobs";
import { logger } from "./logger";
import { CostTracking } from "./extract/extraction-service";

const creditsPerPDFPage = 1;
const stealthProxyCostBonus = 4;

export async function calculateCreditsToBeBilled(options: ScrapeOptions, document: Document | null, jobId: string, costTracking?: any) {
    if (document === null) {
        // Failure -- check cost tracking if FIRE-1
        let creditsToBeBilled = 0;

        if (options.agent?.model?.toLowerCase() === "fire-1" || options.extract?.agent?.model?.toLowerCase() === "fire-1" || options.jsonOptions?.agent?.model?.toLowerCase() === "fire-1") {
            if (process.env.USE_DB_AUTHENTICATION === "true") {
                if (!costTracking) {
                    const job = await supabaseGetJobById(jobId);
                    costTracking = job?.cost_tracking;
                }
    
                if (!costTracking) {
                    logger.warn("No cost tracking found for job", {
                        jobId,
                        scrapeId: jobId
                    });
                }
                
                if (costTracking instanceof CostTracking) {
                    costTracking = costTracking.toJSON();
                }
    
                creditsToBeBilled = Math.ceil((costTracking?.totalCost ?? 1) * 1800);
            } else {
                creditsToBeBilled = 150;
            }
        } 
    
        return creditsToBeBilled;
    }

    let creditsToBeBilled = 1; // Assuming 1 credit per document
    if ((options.extract && options.formats?.includes("extract")) || (options.formats?.includes("changeTracking") && options.changeTrackingOptions?.modes?.includes("json"))) {
        creditsToBeBilled = 5;
    }

    if (options.agent?.model?.toLowerCase() === "fire-1" || options.extract?.agent?.model?.toLowerCase() === "fire-1" || options.jsonOptions?.agent?.model?.toLowerCase() === "fire-1") {
        if (process.env.USE_DB_AUTHENTICATION === "true") {
            if (!costTracking) {
                const job = await supabaseGetJobById(jobId);
                costTracking = job?.cost_tracking;
            }

            if (!costTracking) {
                logger.warn("No cost tracking found for job", {
                    jobId,
                    scrapeId: jobId
                });
            }
            
            if (costTracking instanceof CostTracking) {
                costTracking = costTracking.toJSON();
            }

            creditsToBeBilled = Math.ceil((costTracking?.totalCost ?? 1) * 1800);
        } else {
            creditsToBeBilled = 150;
        }
    } 
    
    if (document.metadata.numPages !== undefined && document.metadata.numPages > 1) {
        creditsToBeBilled += creditsPerPDFPage * (document.metadata.numPages - 1);
    }

    if (document?.metadata?.proxyUsed === "stealth") {
        creditsToBeBilled += stealthProxyCostBonus;
    }

    return creditsToBeBilled;
}