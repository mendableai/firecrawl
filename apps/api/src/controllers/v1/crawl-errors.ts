import { Response } from "express";
import {
  CrawlErrorsResponse,
  CrawlStatusParams,
  CrawlStatusResponse,
  ErrorResponse,
  RequestWithAuth,
} from "./types";
import {
  getCrawl,
  getCrawlExpiry,
  getCrawlJobs,
  getDoneJobsOrdered,
  getDoneJobsOrderedLength,
  getThrottledJobs,
  isCrawlFinished,
} from "../../lib/crawl-redis";
import { getScrapeQueue, redisConnection } from "../../services/queue-service";
import {
  supabaseGetJobById,
  supabaseGetJobsById,
} from "../../lib/supabase-jobs";
import { configDotenv } from "dotenv";
import { Job, JobState } from "bullmq";
import { logger } from "../../lib/logger";
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
  const sc = await getCrawl(req.params.jobId);
  if (!sc) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }

  if (sc.team_id !== req.auth.team_id) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  let jobStatuses = await Promise.all(
    (await getCrawlJobs(req.params.jobId)).map(
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
    robotsBlocked: await redisConnection.smembers(
      "crawl:" + req.params.jobId + ":robots_blocked",
    ),
  });
}
