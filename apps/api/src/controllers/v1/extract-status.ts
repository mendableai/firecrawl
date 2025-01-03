import { Response } from "express";
import {
  supabaseGetJobByIdOnlyData,
  supabaseGetJobsById,
} from "../../lib/supabase-jobs";
import { scrapeStatusRateLimiter } from "../../services/rate-limiter";
import { RequestWithAuth } from "./types";

export async function extractStatusController(
  req: RequestWithAuth<{ jobId: string }, any, any>,
  res: Response,
) {
  try {
    const rateLimiter = scrapeStatusRateLimiter;
    const incomingIP = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress) as string;
    const iptoken = incomingIP;
    await rateLimiter.consume(iptoken);

    const job = await supabaseGetJobByIdOnlyData(req.params.jobId);
    if (!job || job.team_id !== req.auth.team_id) {
      return res.status(403).json({
        success: false,
        error: "You are not allowed to access this resource.",
      });
    }

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
  } catch (error) {
    if (error instanceof Error && error.message == "Too Many Requests") {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      });
    } else {
      return res.status(500).json({
        success: false,
        error: "An unexpected error occurred.",
      });
    }
  }
}
