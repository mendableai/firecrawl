import { Response } from "express";
import { supabaseGetJobByIdOnlyData } from "../../lib/supabase-jobs";
import { getJob } from "./crawl-status";

export async function scrapeStatusController(req: any, res: any) {
  const allowedTeams = [
    "41bdbfe1-0579-4d9b-b6d5-809f16be12f5",
    "511544f2-2fce-4183-9c59-6c29b02c69b5",
    "1ec9a0b3-6e7d-49a9-ad6c-9c598ba824c8",
  ];

  if (!allowedTeams.includes(req.auth.team_id)) {
    return res.status(403).json({
      success: false,
      error: "Forbidden",
    });
  }

  const job = await supabaseGetJobByIdOnlyData(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: "Job not found.",
    });
  }

  if (
    !allowedTeams.includes(job?.team_id) ||
    job?.team_id !== req.auth.team_id
  ) {
    return res.status(403).json({
      success: false,
      error: "You are not allowed to access this resource.",
    });
  }

  const jobData = await getJob(req.params.jobId);
  const data = Array.isArray(jobData?.returnvalue)
    ? jobData?.returnvalue[0]
    : jobData?.returnvalue;

  return res.status(200).json({
    success: true,
    data,
  });
}
