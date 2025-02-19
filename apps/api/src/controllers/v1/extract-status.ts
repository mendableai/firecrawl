import { Response } from "express";
import { RequestWithAuth } from "./types";
import { getExtract, getExtractExpiry } from "../../lib/extract/extract-redis";
import { DBJob, PseudoJob } from "./crawl-status";
import { getExtractQueue } from "../../services/queue-service";
import { ExtractResult } from "../../lib/extract/extraction-service";
import { supabaseGetJobById } from "../../lib/supabase-jobs";

export async function getExtractJob(id: string): Promise<PseudoJob<ExtractResult> | null> {
  const [bullJob, dbJob] = await Promise.all([
    getExtractQueue().getJob(id),
    (process.env.USE_DB_AUTHENTICATION === "true" ? supabaseGetJobById(id) : null) as Promise<DBJob | null>,
  ]);

  if (!bullJob && !dbJob) return null;

  const data = dbJob?.docs ?? bullJob?.returnvalue?.data;

  const job: PseudoJob<any> = {
    id,
    getState: bullJob ? bullJob.getState : (() => dbJob!.success ? "completed" : "failed"),
    returnvalue: data,
    data: {
      scrapeOptions: bullJob ? bullJob.data.scrapeOptions : dbJob!.page_options,
    },
    timestamp: bullJob ? bullJob.timestamp : new Date(dbJob!.date_added).valueOf(),
    failedReason: (bullJob ? bullJob.failedReason : dbJob!.message) || undefined,
  }

  return job;
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

    if (!jobData.returnvalue) {
      // if we got in the split-second where the redis is updated but the bull isn't
      // just pretend it's still processing - MG
      extract.status = "processing";
    } else {
      data = jobData.returnvalue ?? [];
    }
  }

  return res.status(200).json({
    success: extract.status === "failed" ? false : true,
    data,
    status: extract.status,
    error: extract?.error ?? undefined,
    expiresAt: (await getExtractExpiry(req.params.jobId)).toISOString(),
    steps: extract.showSteps ? extract.steps : undefined,
    llmUsage: extract.showLLMUsage ? extract.llmUsage : undefined,
    sources: extract.showSources ? extract.sources : undefined,
  });
}
