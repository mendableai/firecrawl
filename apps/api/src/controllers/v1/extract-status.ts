import { Response } from "express";
import { supabaseGetJobsById } from "../../lib/supabase-jobs";
import { RequestWithAuth } from "./types";

export async function extractStatusController(
  req: RequestWithAuth<{ jobId: string }, any, any>,
  res: Response,
) {
  const jobData = await supabaseGetJobsById([req.params.jobId]);
  if (!jobData || jobData.length === 0) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: jobData[0].docs,
  });
}
