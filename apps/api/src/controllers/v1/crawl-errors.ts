import { Response } from "express";
import {
  CrawlErrorsResponse,
  CrawlStatusParams,
  RequestWithAuth,
} from "./types";
import {
  getCrawl,
  getCrawlJobs,
} from "../../lib/crawl-redis";
import { getScrapeQueue } from "../../services/queue-service";
import { redisEvictConnection } from "../../../src/services/redis";
import { configDotenv } from "dotenv";
import { Job } from "bullmq";
import { logger } from "../../lib/logger";
import { supabase_rr_service } from "../../services/supabase";
import { TEAM_IDS_EXCLUDED_FROM_EXPIRY } from "../../lib/constants";
configDotenv();

export async function getJob(id: string) {
  const job = await getScrapeQueue().getJob(id);
  if (!job) return job;

  return job;
}

export async function getJobs(ids: string[]) {
  const jobs: (Job & { id: string })[] = (
    await Promise.all(ids.map((x) => getScrapeQueue().getJob(x)))
  ).filter((x) => x) as (Job & { id: string })[];

  return jobs;
}

export async function crawlErrorsController(
  req: RequestWithAuth<CrawlStatusParams, undefined, CrawlErrorsResponse>,
  res: Response<CrawlErrorsResponse>,
) {
  const crawlLogger = logger.child({
    module: "crawl-errors",
    method: "crawlErrorsController",
    jobId: req.params.jobId,
    team_id: req.auth.team_id,
  });

  let sc = await getCrawl(req.params.jobId);

  if (!sc) {
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      const { data: failedJobs, error: failedJobError } = await supabase_rr_service
        .from("firecrawl_jobs")
        .select("job_id, url, message, team_id, date_added")
        .eq("crawl_id", req.params.jobId)
        .eq("success", false);

      if (failedJobError) {
        crawlLogger.error("Error getting failed jobs", { error: failedJobError });
        return res.status(500).json({ success: false, error: "Internal server error" });
      }

      if (!failedJobs || failedJobs.length === 0) {
        return res.status(404).json({ success: false, error: "Job not found" });
      }

      const firstJob = failedJobs[0];

      if (firstJob.team_id !== req.auth.team_id) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }

      if (
        !TEAM_IDS_EXCLUDED_FROM_EXPIRY.includes(firstJob.team_id)
        && new Date().valueOf() - new Date(firstJob.date_added).valueOf() > 24 * 60 * 60 * 1000
      ) {
        return res.status(404).json({ success: false, error: "Job expired" });
      }

      const errors = failedJobs.map(job => ({
        id: job.job_id,
        url: job.url || "",
        error: job.message || ""
      }));

      return res.status(200).json({
        errors: errors,
        robotsBlocked: []
      });
    } else {
      return res.status(404).json({ success: false, error: "Job not found" });
    }
  } else {
    if (sc.team_id !== req.auth.team_id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const crawlJobIds = await getCrawlJobs(req.params.jobId);
    
    let jobStatuses = await Promise.all(
      crawlJobIds.map(
        async (x) => [x, await getScrapeQueue().getJobState(x)] as const,
      ),
    );

    const failedJobIDs: string[] = [];

    for (const [id, status] of jobStatuses) {
      if (status === "failed") {
        failedJobIDs.push(id);
      }
    }

    res.status(200).json({
      errors: (await getJobs(failedJobIDs)).map((x) => ({
        id: x.id,
        timestamp:
          x.finishedOn !== undefined
            ? new Date(x.finishedOn).toISOString()
            : undefined,
        url: x.data.url,
        error: x.failedReason,
      })),
      robotsBlocked: await redisEvictConnection.smembers(
        "crawl:" + req.params.jobId + ":robots_blocked",
      ),
    });
  }
}
