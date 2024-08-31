import "dotenv/config";
import { ScrapeLog } from "../../types";
import { PageOptions } from "../../lib/entities";
import { Logger } from "../../lib/logger";
import db from "../db";
import { scrapeLogs } from "../db/schema";

export async function logScrape(
  scrapeLog: ScrapeLog,
  pageOptions?: PageOptions
) {
  if (process.env.USE_DB_AUTHENTICATION === "false") {
    Logger.debug("Skipping logging scrape to DB");
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

    try {
      await db.insert(scrapeLogs).values({
        url: scrapeLog.url,
        scraper: scrapeLog.scraper,
        success: scrapeLog.success,
        responseCode: scrapeLog.response_code,
        timeTakenSeconds: scrapeLog.time_taken_seconds,
        proxy: scrapeLog.proxy,
        retried: scrapeLog.retried,
        errorMessage: scrapeLog.error_message,
        dateAdded: new Date().toISOString(),
        html: "Removed to save db space",
        ipv4Support: scrapeLog.ipv4_support,
        ipv6Support: scrapeLog.ipv6_support,
      });
    } catch (error) {
      Logger.error(`Error logging proxy:\n${JSON.stringify(error)}`);
    }
  } catch (error) {
    Logger.error(`Error logging proxy:\n${JSON.stringify(error)}`);
  }
}
