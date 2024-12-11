import "dotenv/config";
import { ScrapeLog } from "../../types";
import { supabase_service } from "../supabase";
import { PageOptions } from "../../lib/entities";
import { logger } from "../../lib/logger";
import { configDotenv } from "dotenv";
configDotenv();

export async function logScrape(
  scrapeLog: ScrapeLog,
  pageOptions?: PageOptions,
) {
  const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
  if (!useDbAuthentication) {
    logger.debug("Skipping logging scrape to Supabase");
    return;
  }
  try {
    // Only log jobs in production
    // if (process.env.ENV !== "production") {
    //   return;
    // }
    // Redact any pages that have an authorization header
    if (
      pageOptions &&
      pageOptions.headers &&
      pageOptions.headers["Authorization"]
    ) {
      scrapeLog.html = "REDACTED DUE TO AUTHORIZATION HEADER";
    }

    const { data, error } = await supabase_service.from("scrape_logs").insert([
      {
        url: scrapeLog.url,
        scraper: scrapeLog.scraper,
        success: scrapeLog.success,
        response_code: scrapeLog.response_code,
        time_taken_seconds: scrapeLog.time_taken_seconds,
        proxy: scrapeLog.proxy,
        retried: scrapeLog.retried,
        error_message: scrapeLog.error_message,
        date_added: new Date().toISOString(),
        html: "Removed to save db space",
        ipv4_support: scrapeLog.ipv4_support,
        ipv6_support: scrapeLog.ipv6_support,
      },
    ]);

    if (error) {
      logger.error(`Error logging proxy:\n${JSON.stringify(error)}`);
    }
  } catch (error) {
    logger.error(`Error logging proxy:\n${JSON.stringify(error)}`);
  }
}
