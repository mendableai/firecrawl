import { Response } from "express";
import { RequestWithAuth } from "./types";
import {
  getDeepResearch,
  getDeepResearchExpiry,
} from "../../lib/deep-research/deep-research-redis";
import { supabaseGetJobsById } from "../../lib/supabase-jobs";

export async function deepResearchStatusController(
  req: RequestWithAuth<{ jobId: string }, any, any>,
  res: Response,
) {
  const research = await getDeepResearch(req.params.jobId);

  if (!research) {
    return res.status(404).json({
      success: false,
      error: "Deep research job not found",
    });
  }

  let data: any = null;

  if (
    research.status === "completed" &&
    process.env.USE_DB_AUTHENTICATION === "true"
  ) {
    const jobData = await supabaseGetJobsById([req.params.jobId]);
    if (jobData && jobData.length > 0) {
      data = jobData[0].docs[0];
    }
  }

  return res.status(200).json({
    success: research.status === "failed" ? false : true,
    data: {
      finalAnalysis: research.finalAnalysis,
      sources: research.sources,
      activities: research.activities,
      json: research.json,
      // completedSteps: research.completedSteps,
      // totalSteps: research.totalExpectedSteps,
    },
    error: research?.error ?? undefined,
    expiresAt: (await getDeepResearchExpiry(req.params.jobId)).toISOString(),
    currentDepth: research.currentDepth,
    maxDepth: research.maxDepth,
    status: research.status,
    totalUrls: research.sources.length,
    // DO NOT remove - backwards compatibility
    //@deprecated
    activities: research.activities,
    //@deprecated
    sources: research.sources,
    // summaries: research.summaries,
  });
}
