import { ExtractorOptions } from './../../lib/entities';
import { supabase_service } from "../supabase";
import { FirecrawlJob } from "../../types";
import "dotenv/config";

export async function logJob(job: FirecrawlJob) {
  try {
    // Only log jobs in production
    if (process.env.ENV !== "production") {
      return;
    }

    
    const { data, error } = await supabase_service
      .from("firecrawl_jobs")
      .insert([
        {
          success: job.success,
          message: job.message,
          num_docs: job.num_docs,
          docs: job.docs,
          time_taken: job.time_taken,
          team_id: job.team_id === "preview" ? null : job.team_id,
          mode: job.mode,
          url: job.url,
          crawler_options: job.crawlerOptions,
          page_options: job.pageOptions,
          origin: job.origin,
          extractor_options: job.extractor_options,
          num_tokens: job.num_tokens
        },
      ]);
    if (error) {
      console.error("Error logging job:\n", error);
    }
  } catch (error) {
    console.error("Error logging job:\n", error);
  }
}
