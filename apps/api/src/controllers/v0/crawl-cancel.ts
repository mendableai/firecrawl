import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../../src/types";
import { supabase_service } from "../../../src/services/supabase";
import { logger } from "../../../src/lib/logger";
import { getCrawl, saveCrawl } from "../../../src/lib/crawl-redis";
import * as Sentry from "@sentry/node";
import { configDotenv } from "dotenv";
configDotenv();

export async function crawlCancelController(req: Request, res: Response) {
  try {
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";

    const auth = await authenticateUser(req, res, RateLimiterMode.CrawlStatus);
    if (!auth.success) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { team_id } = auth;

    const sc = await getCrawl(req.params.jobId);
    if (!sc) {
      return res.status(404).json({ error: "Job not found" });
    }

    // check if the job belongs to the team
    if (useDbAuthentication) {
      const { data, error: supaError } = await supabase_service
        .from("bulljobs_teams")
        .select("*")
        .eq("job_id", req.params.jobId)
        .eq("team_id", team_id);
      if (supaError) {
        return res.status(500).json({ error: supaError.message });
      }

      if (data.length === 0) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    try {
      sc.cancelled = true;
      await saveCrawl(req.params.jobId, sc);
    } catch (error) {
      logger.error(error);
    }

    res.json({
      status: "cancelled",
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
