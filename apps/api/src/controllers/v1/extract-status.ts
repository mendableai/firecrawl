import { Response } from "express";
import { supabaseGetJobsById } from "../../lib/supabase-jobs";
import { redisConnection } from "../../services/queue-service";
import { RequestWithAuth } from "./types";
import { getExtract, getExtractExpiry } from "../../lib/extract/extract-redis";

const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";

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
    if (useDbAuthentication) {
      const jobData = await supabaseGetJobsById([req.params.jobId]);
      if (!jobData || jobData.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Job not found",
        });
      }
      data = jobData[0].docs;
    } else {
      // Build the Bull job key (as stored by BullMQ)
      const bullKey = `bull:{extractQueue}:${req.params.jobId}`;
      // Use HGETALL to retrieve the hash (because the Bull key is a hash)
      const bullJob = await redisConnection.hgetall(bullKey);
      console.info(bullJob);
      if (!bullJob || Object.keys(bullJob).length === 0) {
        return res.status(404).json({
          success: false,
          error: "Job not found in Bull queue",
        });
      }

      try {
        // The full extraction result is stored in the 'returnvalue' field.
        data = JSON.parse(bullJob.returnvalue).data;
      } catch (error) {
        console.warn("Failed to parse completed job data")
      }
    }
  }

  // console.log(extract.sources);
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
