import { Response } from "express";
import { RequestWithAuth } from "./types";
import { getExtract, getExtractExpiry } from "../../lib/extract/extract-redis";
import { getJob, PseudoJob } from "./crawl-status";
import { getExtractQueue } from "../../services/queue-service";
import { ExtractResult } from "../../lib/extract/extraction-service";



export async function getExtractJob(id: string): Promise<PseudoJob<ExtractResult> | null> {
  return await getJob(getExtractQueue, id);
}

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

  let data: ExtractResult | [] = [];

  if (extract.status === "completed") {
    const jobData = await getExtractJob(req.params.jobId);
    if (!jobData) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }
    data = jobData.returnvalue?.data ?? [];
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
