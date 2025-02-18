import { Response } from "express";
import { RequestWithAuth } from "./types";
import { getGeneratedLlmsTxt, getGeneratedLlmsTxtExpiry } from "../../lib/generate-llmstxt/generate-llmstxt-redis";
import { supabaseGetJobsById } from "../../lib/supabase-jobs";

export async function generateLLMsTextStatusController(
  req: RequestWithAuth<{ jobId: string }, any, any>,
  res: Response,
) {
  const generation = await getGeneratedLlmsTxt(req.params.jobId);

  if (!generation) {
    return res.status(404).json({
      success: false,
      error: "llmsTxt generation job not found",
    });
  }

  let data: any = null;

  if (generation.status === "completed") {
    const jobData = await supabaseGetJobsById([req.params.jobId]);
    if (jobData && jobData.length > 0) {
      data = jobData[0].docs;
    }
  }

  return res.status(200).json({
    success: generation.status === "failed" ? false : true,
    data: data ?? {
      llmstxt: generation.generatedText,
      fullText: generation.fullText,
      url: generation.url,
    },
    status: generation.status,
    error: generation?.error ?? undefined,
    expiresAt: (await getGeneratedLlmsTxtExpiry(req.params.jobId)).toISOString(),
  });
} 