import { Job } from "bullmq";
import { supabase_service as supabase } from "../services/supabase";
import { logger } from "./logger";
import { configDotenv } from "dotenv";
import { Engine } from "../scraper/scrapeURL/engines";
configDotenv();

export type ScrapeErrorEvent = {
  type: "error";
  message: string;
  stack?: string;
};

export type ScrapeScrapeEvent = {
  type: "scrape";
  url: string;
  worker?: string;
  method: Engine;
  result: null | {
    success: boolean;
    response_code?: number;
    response_size?: number;
    error?: string | object;
    // proxy?: string,
    time_taken: number;
  };
};

export type ScrapeQueueEvent = {
  type: "queue";
  event:
    | "waiting"
    | "active"
    | "completed"
    | "paused"
    | "resumed"
    | "removed"
    | "failed";
  worker?: string;
};

export type ScrapeEvent =
  | ScrapeErrorEvent
  | ScrapeScrapeEvent
  | ScrapeQueueEvent;

export class ScrapeEvents {
  static async insert(jobId: string, content: ScrapeEvent) {
    if (jobId === "TEST") return null;

    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
    if (useDbAuthentication) {
      try {
        const result = await supabase
          .from("scrape_events")
          .insert({
            job_id: jobId,
            type: content.type,
            content: content,
            // created_at
          })
          .select()
          .single();
        return (result.data as any).id;
      } catch (error) {
        // logger.error(`Error inserting scrape event: ${error}`);
        return null;
      }
    }

    return null;
  }

  static async updateScrapeResult(
    logId: number | null,
    result: ScrapeScrapeEvent["result"],
  ) {
    if (logId === null) return;

    try {
      const previousLog = (
        await supabase.from("scrape_events").select().eq("id", logId).single()
      ).data as any;
      await supabase
        .from("scrape_events")
        .update({
          content: {
            ...previousLog.content,
            result,
          },
        })
        .eq("id", logId);
    } catch (error) {
      logger.error(`Error updating scrape result: ${error}`);
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
      logger.error(`Error logging job event: ${error}`);
    }
  }
}
