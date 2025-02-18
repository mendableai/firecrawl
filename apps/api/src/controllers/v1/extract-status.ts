import { Response } from "express";
import { supabaseGetJobsById } from "../../lib/supabase-jobs";
import { RequestWithAuth } from "./types";
import { getExtract, getExtractExpiry } from "../../lib/extract/extract-redis";
import { getExtractQueue } from "../../services/queue-service";

export async function extractStatusController(
  req: RequestWithAuth<{ jobId: string }, any, any>,
  res: Response,
) {
  const extract = await getExtract(req.params.jobId);

  if (!extract) {
    return res.status(404).json({
      success: false,
      error: "Extract job not found",
    });
  }

  let data: any[] = [];
  if (extract.status === "completed") {
    // Try to get data from BullMQ first
    const bullJob = await getExtractQueue().getJob(req.params.jobId);
    let jobData = bullJob?.returnvalue;

    // If USE_DB_AUTHENTICATION is true or no BullMQ data, try Supabase
    if (!jobData && process.env.USE_DB_AUTHENTICATION === "true") {
      try {
        const supabaseData = await supabaseGetJobsById([req.params.jobId]);
        if (supabaseData && supabaseData.length > 0) {
          jobData = supabaseData[0].docs;
        }
      } catch (error) {
        console.warn('Supabase data fetch failed:', error);
      }
    }

    if (jobData) {
      data = Array.isArray(jobData) ? jobData : [jobData];
    }
  }

  return res.status(200).json({
    success: extract.status === "failed" ? false : true,
    data: data,
    status: extract.status,
    error: extract?.error ?? undefined,
    expiresAt: (await getExtractExpiry(req.params.jobId)).toISOString(),
    steps: extract.showSteps ? extract.steps : undefined,
    llmUsage: extract.showLLMUsage ? extract.llmUsage : undefined,
    sources: extract.showSources ? extract.sources : undefined,
  });
}
