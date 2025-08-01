import { Request, Response } from "express";
import { logger } from "../../../src/lib/logger";
import { getCrawl, getCrawlJobs } from "../../../src/lib/crawl-redis";
import { getJobs } from "./crawl-status";
import * as Sentry from "@sentry/node";

export async function crawlJobStatusPreviewController(
  req: Request,
  res: Response,
) {
  try {
    const sc = await getCrawl(req.params.jobId);
    if (!sc) {
      return res.status(404).json({ error: "Job not found" });
    }

    const jobIDs = await getCrawlJobs(req.params.jobId);

    // let data = job.returnvalue;
    // if (process.env.USE_DB_AUTHENTICATION === "true") {
    //   const supabaseData = await supabaseGetJobById(req.params.jobId);

    //   if (supabaseData) {
    //     data = supabaseData.docs;
    //   }
    // }

    const jobs = (await getJobs(req.params.jobId, jobIDs)).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const jobStatuses = await Promise.all(jobs.map((x) => x.getState()));
    const jobStatus = sc.cancelled
      ? "failed"
      : jobStatuses.every((x) => x === "completed")
        ? "completed"
        : jobStatuses.some((x) => x === "failed")
          ? "failed"
          : "active";

    const data = jobs.map((x) =>
      Array.isArray(x.returnvalue) ? x.returnvalue[0] : x.returnvalue,
    );

    res.json({
      status: jobStatus,
      current: jobStatuses.filter((x) => x === "completed" || x === "failed")
        .length,
      total: jobs.length,
      data: jobStatus === "completed" ? data : null,
      partial_data:
        jobStatus === "completed" ? [] : data.filter((x) => x !== null),
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
