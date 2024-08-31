import { FirecrawlJob } from "../../types";
import { posthog } from "../posthog";
import "dotenv/config";
import { Logger } from "../../lib/logger";
import db from "../db";
import { firecrawlJobs } from "../db/schema";

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

    try {
      await db.insert(firecrawlJobs).values({
        jobId: job.job_id ? job.job_id : null,
        success: job.success,
        message: job.message,
        numDocs: job.num_docs,
        docs: job.docs,
        timeTaken: job.time_taken.toString(),
        teamId: job.team_id === "preview" ? null : job.team_id,
        mode: job.mode,
        url: job.url,
        crawlerOptions: job.crawlerOptions,
        pageOptions: job.pageOptions,
        origin: job.origin,
        extractorOptions: job.extractor_options,
        numTokens: job.num_tokens,
        retry: !!job.retry,
        crawlId: job.crawl_id,
      });
    } catch (error) {
      Logger.error(`Error logging job: ${error.message}`);
    }

    if (process.env.POSTHOG_API_KEY && !job.crawl_id) {
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
  } catch (error) {
    Logger.error(`Error logging job: ${error.message}`);
  }
}
