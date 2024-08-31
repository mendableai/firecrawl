import { Job } from "bullmq";
import type { baseScrapers } from "../scraper/WebScraper/single_url";
import { Logger } from "./logger";
import db from "../services/db";
import { scrapeEvents } from "../services/db/schema";
import { eq } from "drizzle-orm";

export type ScrapeErrorEvent = {
  type: "error",
  message: string,
  stack?: string,
}

export type ScrapeScrapeEvent = {
  type: "scrape",
  url: string,
  worker?: string,
  method: (typeof baseScrapers)[number],
  result: null | {
    success: boolean,
    response_code?: number,
    response_size?: number,
    error?: string | object,
    // proxy?: string,
    time_taken: number,
  },
}

export type ScrapeQueueEvent = {
  type: "queue",
  event: "waiting" | "active" | "completed" | "paused" | "resumed" | "removed" | "failed",
  worker?: string,
}

export type ScrapeEvent = ScrapeErrorEvent | ScrapeScrapeEvent | ScrapeQueueEvent;

export class ScrapeEvents {
  static async insert(jobId: string, content: ScrapeEvent) {
    if (jobId === "TEST") return null;
    
    if (process.env.USE_DB_AUTHENTICATION) {
      try {
        const result = await db.insert(scrapeEvents).values({
          jobId: jobId,
          type: content.type,
          content: content,
        }).returning();
        return result[0].id;
      } catch (error) {
        // Logger.error(`Error inserting scrape event: ${error}`);
        return null;
      }
    }

    return null;
  }

  static async updateScrapeResult(logId: number | null, result: ScrapeScrapeEvent["result"]) {
    if (logId === null) return;

    try {
      const previousLog = (await db.select().from(scrapeEvents).where(eq(scrapeEvents.id, logId)).limit(1))[0];
      await db.update(scrapeEvents).set({
        content: {
          ...(previousLog.content as any),
          type: "scrape",
          result,
        },
      }).where(eq(scrapeEvents.id, logId));
    } catch (error) {
      Logger.error(`Error updating scrape result: ${error}`);
    }
  }

  static async logJobEvent(job: Job | any, event: ScrapeQueueEvent["event"]) {
    try {
      await this.insert(((job as any).id ? (job as any).id : job) as string, {
        type: "queue",
        event,
        worker: process.env.FLY_MACHINE_ID,
      });
    } catch (error) {
      Logger.error(`Error logging job event: ${error}`);
    }
  }
}
