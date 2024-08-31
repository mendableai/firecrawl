import { Response } from "express";
import { supabaseGetJobByIdOnlyData } from "../../lib/supabase-jobs";
import { scrapeStatusRateLimiter } from "../../services/rate-limiter";

export async function scrapeStatusController(req: any, res: any) {
  try {
    const rateLimiter = scrapeStatusRateLimiter;
    const incomingIP = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress) as string;
    const iptoken = incomingIP;
    await rateLimiter.consume(iptoken);

    const job = await supabaseGetJobByIdOnlyData(req.params.jobId);

    return res.status(200).json({
      success: true,
      data: job?.docs[0],
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
