import { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { supabaseGetJobById } from "../../../lib/supabase-jobs";
import { addScrapeJob } from "../../../services/queue-jobs";
import { getJobPriority } from "../../../lib/job-priority";
import { v4 as uuidv4 } from "uuid";

export async function rerunJobController(req: Request, res: Response) {
  try {
    const { jobId, teamId } = req.query;

    if (!jobId || !teamId) {
      return res.status(400).json({
        error: "jobId and teamId are required query parameters"
      });
    }

    logger.info("Re-running job", { jobId, teamId });

    const originalJob = await supabaseGetJobById(jobId as string);

    if (!originalJob) {
      return res.status(404).json({
        error: "Job not found"
      });
    }

    if (originalJob.team_id !== teamId) {
      return res.status(403).json({
        error: "Team ID does not match the job's team ID"
      });
    }

    if (originalJob.mode !== "single_urls" && originalJob.mode !== "scrape") {
      return res.status(400).json({
        error: "Only scrape jobs can be re-run with this endpoint"
      });
    }

    const newJobId = uuidv4();

    const jobPriority = await getJobPriority({
      team_id: teamId as string,
      basePriority: 10,
    });

    const webScraperOptions = {
      url: originalJob.url,
      mode: "single_urls" as const,
      team_id: teamId as string,
      scrapeOptions: originalJob.page_options || {},
      internalOptions: {
        teamId: teamId as string,
        saveScrapeResultToGCS: process.env.GCS_FIRE_ENGINE_BUCKET_NAME ? true : false,
        zeroDataRetention: false,
      },
      origin: originalJob.origin || "api",
      integration: originalJob.integration,
      startTime: Date.now(),
      zeroDataRetention: false,
    };

    const bullJob = await addScrapeJob(
      webScraperOptions,
      {},
      newJobId,
      jobPriority,
      false
    );

    logger.info("Successfully re-ran job", {
      originalJobId: jobId,
      newJobId,
      teamId,
      bullJobCreated: !!bullJob
    });

    return res.status(200).json({
      success: true,
      message: "Job re-run successfully initiated",
      originalJobId: jobId,
      newJobId,
      addedToBullMQ: !!bullJob
    });

  } catch (error) {
    logger.error("Error re-running job", { error, jobId: req.query.jobId, teamId: req.query.teamId });
    return res.status(500).json({
      error: "Internal server error while re-running job"
    });
  }
}
