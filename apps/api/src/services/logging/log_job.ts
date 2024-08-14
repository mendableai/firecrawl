import { ExtractorOptions } from "./../../lib/entities";
import { supabase_service } from "../supabase";
import { FirecrawlJob } from "../../types";
import { posthog } from "../posthog";
import "dotenv/config";
import { Logger } from "../../lib/logger";

export async function logJob(job: FirecrawlJob) {
  try {
    if (process.env.USE_DB_AUTHENTICATION === "false") {
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
        },
      ]);

    if (process.env.POSTHOG_API_KEY) {
      let phLog = {
        distinctId: "from-api", //* To identify this on the group level, setting distinctid to a static string per posthog docs: https://posthog.com/docs/product-analytics/group-analytics#advanced-server-side-only-capturing-group-events-without-a-user
        ...(job.team_id !== "preview" && {
          groups: { team: job.team_id },
        }), //* Identifying event on this team
        event: "job-logged",
        properties: {
          success: job.success,
          message: job.message,
          num_docs: job.num_docs,
          time_taken: job.time_taken,
          team_id: job.team_id === "preview" ? null : job.team_id,
          mode: job.mode,
          url: job.url,
          crawler_options: job.crawlerOptions,
          page_options: job.pageOptions,
          origin: job.origin,
          extractor_options: job.extractor_options,
          num_tokens: job.num_tokens,
          retry: job.retry,
        },
      };
      posthog.capture(phLog);
    }
    if (error) {
      Logger.error(`Error logging job: ${error.message}`);
    }
  } catch (error) {
    Logger.error(`Error logging job: ${error.message}`);
  }
}
