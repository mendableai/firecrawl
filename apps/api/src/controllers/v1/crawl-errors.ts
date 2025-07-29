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
  let jobIds: string[] = [];

  if (!sc) {
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      const { data: crawlJobs, error: crawlJobError } = await supabase_rr_service
        .from("firecrawl_jobs")
        .select("*")
        .eq("job_id", req.params.jobId)
        .limit(1);

      if (crawlJobError) {
        crawlLogger.error("Error getting crawl job", { error: crawlJobError });
        return res.status(500).json({ success: false, error: "Internal server error" });
      }

      if (!crawlJobs || crawlJobs.length === 0) {
        return res.status(404).json({ success: false, error: "Job not found" });
      }

      const crawlJob = crawlJobs[0];

      if (crawlJob.team_id !== req.auth.team_id) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }

      const teamIdsExcludedFromExpiry = [
        "8f819703-1b85-4f7f-a6eb-e03841ec6617",
        "f96ad1a4-8102-4b35-9904-36fd517d3616",
      ];

      if (
        !teamIdsExcludedFromExpiry.includes(crawlJob.team_id)
        && new Date().valueOf() - new Date(crawlJob.date_added).valueOf() > 24 * 60 * 60 * 1000
      ) {
        return res.status(404).json({ success: false, error: "Job expired" });
      }

      const { data: scrapeJobs, error: scrapeJobError } = await supabase_rr_service
        .from("firecrawl_jobs")
        .select("job_id")
        .eq("crawl_id", req.params.jobId)
        .eq("team_id", req.auth.team_id);

      if (scrapeJobError) {
        crawlLogger.error("Error getting scrape jobs", { error: scrapeJobError });
        return res.status(500).json({ success: false, error: "Internal server error" });
      }

      jobIds = scrapeJobs?.map(job => job.job_id) || [];
    } else {
      return res.status(404).json({ success: false, error: "Job not found" });
    }
  } else {
    if (sc.team_id !== req.auth.team_id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    jobIds = await getCrawlJobs(req.params.jobId);
  }

  let jobStatuses = await Promise.all(
    jobIds.map(
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
