import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../types";
import { Logger } from "../../lib/logger";
import { getCrawl, saveCrawl } from "../../lib/crawl-redis";
import * as Sentry from "@sentry/node";
import db from "../../services/db";
import { bulljobsTeams } from "../../services/db/schema";
import { and, eq } from "drizzle-orm";

export async function crawlCancelController(req: Request, res: Response) {
  try {
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';

    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.CrawlStatus
    );
    if (!success) {
      return res.status(status).json({ error });
    }

    const sc = await getCrawl(req.params.jobId);
    if (!sc) {
      return res.status(404).json({ error: "Job not found" });
    }

    // check if the job belongs to the team
    if (useDbAuthentication) {
      const data = await db.select()
        .from(bulljobsTeams)
        .where(and(
          eq(bulljobsTeams.jobId, req.params.jobId),
          eq(bulljobsTeams.teamId, team_id)
        ));

      if (data.length === 0) {
        return res.status(403).json({ error: "Unauthorized" });
      }
    }

    try {
      sc.cancelled = true;
      await saveCrawl(req.params.jobId, sc);
    } catch (error) {
      Logger.error(error);
    }

    res.json({
      status: "cancelled"
    });
  } catch (error) {
    Sentry.captureException(error);
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
