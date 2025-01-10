import { Response } from "express";
import { supabaseGetJobByIdOnlyData } from "../../lib/supabase-jobs";
import { scrapeStatusRateLimiter } from "../../services/rate-limiter";

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

  if (
    !allowedTeams.includes(job?.team_id) ||
    job?.team_id !== req.auth.team_id
  ) {
    return res.status(403).json({
      success: false,
      error: "You are not allowed to access this resource.",
    });
  }

  return res.status(200).json({
    success: true,
    data: job?.docs[0],
  });
}
