import { Request, Response } from "express";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../../src/types";
import { getScrapeQueue } from "../../../src/services/queue-service";
import { Logger } from "../../../src/lib/logger";
import { getCrawl, getCrawlJobs } from "../../../src/lib/crawl-redis";
import { supabaseGetJobById } from "../../../src/lib/supabase-jobs";

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

    const sc = await getCrawl(req.params.jobId);
    if (!sc) {
      return res.status(404).json({ error: "Job not found" });
    }

    if (sc.team_id !== team_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const jobIDs = await getCrawlJobs(req.params.jobId);

    const jobs = (await Promise.all(jobIDs.map(async x => {
      const job = await getScrapeQueue().getJob(x);
      
      if (process.env.USE_DB_AUTHENTICATION === "true") {
        const supabaseData = await supabaseGetJobById(job.id);

        if (supabaseData) {
          job.returnvalue = supabaseData.docs;
        }
      }

      return job;
    }))).sort((a, b) => a.timestamp - b.timestamp);
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
