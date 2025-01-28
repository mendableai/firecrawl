import { Response } from "express";
import { supabaseGetJobsById } from "../../lib/supabase-jobs";
import { RequestWithAuth } from "./types";
import { getExtract, getExtractExpiry } from "../../lib/extract/extract-redis";

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
    const jobData = await supabaseGetJobsById([req.params.jobId]);
    if (!jobData || jobData.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    data = jobData[0].docs;
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
