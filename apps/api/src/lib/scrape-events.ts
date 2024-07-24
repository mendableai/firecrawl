import type { baseScrapers } from "../scraper/WebScraper/single_url";
import { supabase_service as supabase } from "../services/supabase";

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
  event: "created" | "started" | "interrupted" | "finished",
  worker?: string,
}

export type ScrapeEvent = ScrapeErrorEvent | ScrapeScrapeEvent | ScrapeQueueEvent;

export class ScrapeEvents {
  static async insert(jobId: string, content: ScrapeEvent) {
    if (jobId === "TEST") return null;
    
    if (process.env.USE_DB_AUTHENTICATION) {
      const result = await supabase.from("scrape_events").insert({
        job_id: jobId,
        type: content.type,
        content: content,
        // created_at
      }).select().single();
      return (result.data as any).id;
    }

    return null;
  }

  static async updateScrapeResult(logId: number | null, result: ScrapeScrapeEvent["result"]) {
    if (logId === null) return;

    const previousLog = (await supabase.from("scrape_events").select().eq("id", logId).single()).data as any;
    await supabase.from("scrape_events").update({
      content: {
        ...previousLog.content,
        result,
      }
    }).eq("id", logId);
  }
}
