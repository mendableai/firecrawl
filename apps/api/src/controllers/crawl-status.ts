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

    const isCancelled = await (await getWebScraperQueue().client).exists("cancelled:" + req.params.jobId);

    let progress = job.progress;
    if(typeof progress !== 'object') {
      progress = {
        current: 0,
        current_url: '',
        total: 0,
        current_step: '',
        partialDocs: []
      }
    }
    const { 
      current = 0, 
      current_url = '', 
      total = 0, 
      current_step = '', 
      partialDocs = [] 
    } = progress as { current: number, current_url: string, total: number, current_step: string, partialDocs: any[] };

    let data = job.returnvalue;
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      const supabaseData = await supabaseGetJobById(req.params.jobId);

      if (supabaseData) {
        data = supabaseData.docs;
      }
    }

    const jobStatus = await job.getState();

    res.json({
      status: isCancelled ? "failed" : jobStatus,
      // progress: job.progress(),
      current,
      current_url,
      current_step,
      total,
      data: data && !isCancelled ? data : null,
      partial_data: jobStatus == 'completed' && !isCancelled ? [] : partialDocs,
    });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
