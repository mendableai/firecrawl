import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../../src/types";
import { getScrapeQueue } from "../../../src/services/queue-service";
import { logger } from "../../../src/lib/logger";
import { getCrawl, getCrawlJobs } from "../../../src/lib/crawl-redis";
import { supabaseGetJobsByCrawlId } from "../../../src/lib/supabase-jobs";
import * as Sentry from "@sentry/node";
import { configDotenv } from "dotenv";
import { Job } from "bullmq";
import { toLegacyDocument } from "../v1/types";
configDotenv();

export async function getJobs(crawlId: string, ids: string[]) {
  const jobs = (
    await Promise.all(ids.map((x) => getScrapeQueue().getJob(x)))
  ).filter((x) => x) as Job[];

  if (process.env.USE_DB_AUTHENTICATION === "true") {
    const supabaseData = await supabaseGetJobsByCrawlId(crawlId);

    supabaseData.forEach((x) => {
      const job = jobs.find((y) => y.id === x.job_id);
      if (job) {
        job.returnvalue = x.docs;
      }
    });
  }

  jobs.forEach((job) => {
    job.returnvalue = Array.isArray(job.returnvalue)
      ? job.returnvalue[0]
      : job.returnvalue;
  });

  return jobs;
}

export async function crawlStatusController(req: Request, res: Response) {
  try {
    const auth = await authenticateUser(req, res, RateLimiterMode.CrawlStatus);
    if (!auth.success) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { team_id } = auth;

    const sc = await getCrawl(req.params.jobId);
    if (!sc) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (sc.team_id !== team_id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    let jobIDs = await getCrawlJobs(req.params.jobId);
    let jobs = await getJobs(req.params.jobId, jobIDs);
    let jobStatuses = await Promise.all(jobs.map((x) => x.getState()));

    // Combine jobs and jobStatuses into a single array of objects
    let jobsWithStatuses = jobs.map((job, index) => ({
      job,
      status: jobStatuses[index],
    }));

    // Filter out failed jobs
    jobsWithStatuses = jobsWithStatuses.filter(
      (x) => x.status !== "failed" && x.status !== "unknown",
    );

    // Sort jobs by timestamp
    jobsWithStatuses.sort((a, b) => a.job.timestamp - b.job.timestamp);

    // Extract sorted jobs and statuses
    jobs = jobsWithStatuses.map((x) => x.job);
    jobStatuses = jobsWithStatuses.map((x) => x.status);

    const jobStatus = sc.cancelled
      ? "failed"
      : jobStatuses.every((x) => x === "completed")
        ? "completed"
        : "active";

    const data = jobs
      .filter(
        (x) =>
          x.failedReason !== "Concurreny limit hit" && x.returnvalue !== null,
      )
      .map((x) =>
        Array.isArray(x.returnvalue) ? x.returnvalue[0] : x.returnvalue,
      );

    if (
      jobs.length > 0 &&
      jobs[0].data &&
      jobs[0].data.pageOptions &&
      !jobs[0].data.pageOptions.includeRawHtml
    ) {
      data.forEach((item) => {
        if (item) {
          delete item.rawHtml;
        }
      });
    }

    res.json({
      status: jobStatus,
      current: jobStatuses.filter((x) => x === "completed" || x === "failed")
        .length,
      total: jobs.length,
      data:
        jobStatus === "completed"
          ? data.map((x) => toLegacyDocument(x, sc.internalOptions))
          : null,
      partial_data:
        jobStatus === "completed"
          ? []
          : data
              .filter((x) => x !== null)
              .map((x) => toLegacyDocument(x, sc.internalOptions)),
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
