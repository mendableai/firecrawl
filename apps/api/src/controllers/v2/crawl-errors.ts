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
import { redisEvictConnection } from "../../../src/services/redis";
import { configDotenv } from "dotenv";
import { supabase_rr_service } from "../../services/supabase";
import { logger } from "../../lib/logger";
import { deserializeTransportableError } from "../../lib/error-serde";
import { TransportableError } from "../../lib/error";
import { nuqGetJobsWithStatus } from "../../services/worker/nuq";
configDotenv();

export async function crawlErrorsController(
  req: RequestWithAuth<CrawlStatusParams, undefined, CrawlErrorsResponse>,
  res: Response<CrawlErrorsResponse>,
) {
  const sc = await getCrawl(req.params.jobId);
  
  if (sc) {
    if (sc.team_id !== req.auth.team_id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const failedJobs = (await nuqGetJobsWithStatus<any, any>(await getCrawlJobs(req.params.jobId), "failed")).filter(x => x.failedReason);

    res.status(200).json({
      errors: failedJobs.map((x) => {
        const error = deserializeTransportableError(x.failedReason!) as TransportableError | null;
        return {
          id: x.id,
          timestamp:
            x.finishedAt !== undefined
              ? new Date(x.finishedAt).toISOString()
              : undefined,
          url: x.data.url,
          ...(error ? {
            code: error.code,
            error: error.message,
          } : {
            error: x.failedReason!,
          }),
        };
      }),
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
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    const crawlTtlHours = req.acuc?.flags?.crawlTtlHours ?? 24;
    const crawlTtlMs = crawlTtlHours * 60 * 60 * 1000;

    if (
      crawlJob
      && new Date().valueOf() - new Date(crawlJob.date_added).valueOf() > crawlTtlMs
    ) {
      return res.status(404).json({ success: false, error: "Job expired" });
    }

    if (!crawlJobs || crawlJobs.length === 0) {
      return res.status(404).json({ success: false, error: "Job not found" });
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

    res.status(200).json({
      errors: (failedJobs || []).map((job) => {
        const error = deserializeTransportableError(job.message) as TransportableError | null;
        return {
          id: job.job_id,
          timestamp:
            job.finishedOn !== undefined
              ? new Date(job.finishedOn).toISOString()
              : undefined,
          url: job.url,
          ...(error ? {
            code: error.code,
            error: error.message,
          } : {
            error: job.message,
          }),
        };
      }),
      robotsBlocked: await redisEvictConnection.smembers(
        "crawl:" + req.params.jobId + ":robots_blocked",
      ),
    });
  } else {
    return res.status(404).json({ success: false, error: "Job not found" });
  }
}
