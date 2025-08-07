import { Request, Response } from "express";
import { supabaseGetJobById } from "../../../lib/supabase-jobs";
import { addScrapeJob } from "../../../services/queue-jobs";
import { logger } from "../../../lib/logger";
import { v4 as uuidv4 } from "uuid";

const DEBUG_TEAM_ID = "a4569b15-9727-4e5a-b5da-1dd7c94377b1";

export async function debugJobController(req: Request, res: Response) {
  try {
    const jobId: string = req.body.job_id;

    if (!jobId) {
      return res.status(400).json({ 
        success: false, 
        error: "job_id is required" 
      });
    }

    let originalJob;
    try {
      originalJob = await supabaseGetJobById(jobId);
    } catch (supabaseError) {
      if (supabaseError.message?.includes("Supabase RR client is not configured")) {
        return res.status(503).json({ 
          success: false, 
          error: "Database not configured. Cannot retrieve original job data." 
        });
      }
      throw supabaseError;
    }
    
    if (!originalJob) {
      return res.status(404).json({ 
        success: false, 
        error: "Job not found" 
      });
    }

    const crawlerOptions = originalJob.crawler_options ? JSON.parse(originalJob.crawler_options) : null;
    const scrapeOptions = originalJob.page_options ? JSON.parse(originalJob.page_options) : {};

    const newJobId = uuidv4();
    const webScraperOptions = {
      url: originalJob.url,
      mode: originalJob.mode as "single_urls" | "sitemap" | "crawl",
      team_id: DEBUG_TEAM_ID,
      crawlerOptions,
      scrapeOptions,
      origin: "debug-job",
      zeroDataRetention: false,
    };

    const job = await addScrapeJob(webScraperOptions, {}, newJobId);

    logger.info(`Debug job created for original job ${jobId}`, {
      originalJobId: jobId,
      newJobId,
      originalTeamId: originalJob.team_id,
      debugTeamId: DEBUG_TEAM_ID,
    });

    res.json({ 
      success: true, 
      jobId: newJobId,
      originalJobId: jobId,
      message: "Debug job created successfully"
    });
  } catch (error) {
    logger.error(`Error creating debug job: ${error}`);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
}
