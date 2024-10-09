import { supabase_service } from "../supabase";
import { FirecrawlJob } from "../../types";
import "dotenv/config";
import { Logger } from "../../lib/logger";
import { configDotenv } from "dotenv";
configDotenv();

export async function logJob(job: FirecrawlJob) {
  try {
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
    if (!useDbAuthentication) {
      return;
    }

    // Redact any pages that have an authorization header
    if (
      job.pageOptions &&
      job.pageOptions.headers &&
      job.pageOptions.headers["Authorization"]
    ) {
      job.pageOptions.headers["Authorization"] = "REDACTED";
      job.docs = [{ content: "REDACTED DUE TO AUTHORIZATION HEADER", html: "REDACTED DUE TO AUTHORIZATION HEADER" }];
    }

    const { data, error } = await supabase_service
      .from("firecrawl_jobs")
      .insert([
        {
          job_id: job.job_id ? job.job_id : null,
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
          num_tokens: job.num_tokens,
          retry: !!job.retry,
          crawl_id: job.crawl_id,
        },
      ]);
    if (error) {
      Logger.error(`Error logging job: ${error.message}`);
    }
  } catch (error) {
    Logger.error(`Error logging job: ${error.message}`);
  }
}
