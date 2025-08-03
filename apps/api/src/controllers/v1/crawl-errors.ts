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
import { supabase_rr_service } from "../../services/supabase";
import { logger } from "../../lib/logger";
import { sendErrorResponse } from "../error-handler";
import { ForbiddenError, JobExpiredError, JobNotFoundError } from "../../lib/common-errors";
import { getJobErrorCode } from "../../lib/error-serialization";
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
  
  if (sc) {
    if (sc.team_id !== req.auth.team_id) {
      return sendErrorResponse(res, new ForbiddenError(), 403);
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
        code: getJobErrorCode(x),
      })),
      robotsBlocked: await redisEvictConnection.smembers(
        "crawl:" + req.params.jobId + ":robots_blocked",
      ),
    });
  } else if (process.env.USE_DB_AUTHENTICATION === "true") {
    const { data: crawlJobs, error: crawlJobError } = await supabase_rr_service
      .from("firecrawl_jobs")
      .select("*")
      .eq("job_id", req.params.jobId)
      .limit(1)
      .throwOnError();

    if (crawlJobError) {
      logger.error("Error getting crawl job", { error: crawlJobError });
      throw crawlJobError;
    }

    const crawlJob = crawlJobs[0];

    if (crawlJob && crawlJob.team_id !== req.auth.team_id) {
      return sendErrorResponse(res, new ForbiddenError(), 403);
    }

    const crawlTtlHours = req.acuc?.flags?.crawlTtlHours ?? 24;
    const crawlTtlMs = crawlTtlHours * 60 * 60 * 1000;

    if (
      crawlJob
      && new Date().valueOf() - new Date(crawlJob.date_added).valueOf() > crawlTtlMs
    ) {
      return sendErrorResponse(res, new JobExpiredError(), 404);
    }

    if (!crawlJobs || crawlJobs.length === 0) {
      return sendErrorResponse(res, new JobNotFoundError(), 404);
    }

    const { data: failedJobs, error: failedJobsError } = await supabase_rr_service
      .from("firecrawl_jobs")
      .select("*")
      .eq("crawl_id", req.params.jobId)
      .eq("team_id", req.auth.team_id)
      .eq("success", false)
      .throwOnError();

    if (failedJobsError) {
      logger.error("Error getting failed jobs", { error: failedJobsError });
      throw failedJobsError;
    }

    const queue = getScrapeQueue();
    const jobStatuses = await Promise.all(
      (failedJobs || []).map(async (job) => {
        const bullJob = await queue.getJob(job.job_id);
        return {
          id: job.job_id,
          timestamp: new Date(job.date_added).toISOString(),
          url: job.page_options?.url || job.page_options?.urls?.[0] || "Unknown URL",
          error: job.message || "Unknown error",
          code: bullJob ? getJobErrorCode(bullJob) : "UNKNOWN_ERROR",
        };
      })
    );

    res.status(200).json({
      errors: jobStatuses,
      robotsBlocked: await redisEvictConnection.smembers(
        "crawl:" + req.params.jobId + ":robots_blocked",
      ),
    });
  } else {
    return sendErrorResponse(res, new JobNotFoundError(), 404);
  }
}
