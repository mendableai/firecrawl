import { Request, Response } from "express";
import { getWebScraperQueue } from "../../src/services/queue-service";
import { supabaseGetJobById } from "../../src/lib/supabase-jobs";
import { Logger } from "../../src/lib/logger";

export async function crawlJobStatusPreviewController(req: Request, res: Response) {
  try {
    const job = await getWebScraperQueue().getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

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

    let jobStatus = await job.getState();
    if (jobStatus === 'waiting' || jobStatus === 'delayed' || jobStatus === 'waiting-children' || jobStatus === 'unknown' || jobStatus === 'prioritized') {
      jobStatus = 'active';
    }

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
