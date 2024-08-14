import { Request, Response } from "express";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../src/types";
import { addWebScraperJob } from "../../src/services/queue-jobs";
import { getWebScraperQueue } from "../../src/services/queue-service";
import { supabaseGetJobById } from "../../src/lib/supabase-jobs";
import { Logger } from "../../src/lib/logger";

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
    const job = await getWebScraperQueue().getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const { current, current_url, total, current_step, partialDocs } = await job.progress();

    let data = job.returnvalue;
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      const supabaseData = await supabaseGetJobById(req.params.jobId);

      if (supabaseData) {
        data = supabaseData.docs;
      }
    }

    const jobStatus = await job.getState();

    res.json({
      status: jobStatus,
      // progress: job.progress(),
      current,
      current_url,
      current_step,
      total,
      data: data ? data : null,
      partial_data: jobStatus == 'completed' ? [] : partialDocs,
    });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
