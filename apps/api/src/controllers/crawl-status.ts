import { Request, Response } from "express";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../src/types";
import { getScrapeQueue } from "../../src/services/queue-service";
import { Logger } from "../../src/lib/logger";
import { getCrawl, getCrawlJobs } from "../../src/lib/crawl-redis";

export async function crawlStatusController(req: Request, res: Response) {
  try {
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.CrawlStatus
    );
    if (!success) {
      return res.status(status).json({ error });
    }
    // const job = await getWebScraperQueue().getJob(req.params.jobId);
    // if (!job) {
    //   return res.status(404).json({ error: "Job not found" });
    // }

    // const isCancelled = await (await getWebScraperQueue().client).exists("cancelled:" + req.params.jobId);

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

    const jobs = await Promise.all(jobIDs.map(x => getScrapeQueue().getJob(x)));
    const jobStatuses = await Promise.all(jobs.map(x => x.getState()));
    const jobStatus = sc.cancelled ? "failed" : jobStatuses.every(x => x === "completed") ? "completed" : jobStatuses.some(x => x === "failed") ? "failed" : "active";

    const data = jobs.map(x => Array.isArray(x.returnvalue) ? x.returnvalue[0] : x.returnvalue);

    res.json({
      status: jobStatus,
      current: jobStatuses.filter(x => x === "completed" || x === "failed").length,
      total: jobs.length,
      data: jobStatus === "completed" ? data : null,
      partial_data: jobStatus === "completed" ? [] : data.filter(x => x !== null),
    });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
