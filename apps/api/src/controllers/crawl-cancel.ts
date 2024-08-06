import { Request, Response } from "express";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../src/types";
import { getWebScraperQueue } from "../../src/services/queue-service";
import { supabase_service } from "../../src/services/supabase";
import { billTeam } from "../../src/services/billing/credit_billing";
import { Logger } from "../../src/lib/logger";

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
    const job = await getWebScraperQueue().getJob(req.params.jobId);
    if (!job) {
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

    const jobState = await job.getState();
    let progress = job.progress;
    if(typeof progress !== 'object') {
      progress = {
        partialDocs: []
      }
    }
    const { 
      partialDocs = [] 
    } = progress as { partialDocs: any[] };

    if (partialDocs && partialDocs.length > 0 && jobState === "active") {
      Logger.info("Billing team for partial docs...");
      // Note: the credits that we will bill them here might be lower than the actual
      // due to promises that are not yet resolved
      await billTeam(team_id, partialDocs.length);
    }

    try {
      await (await getWebScraperQueue().client).set("cancelled:" + job.id, "true", "EX", 60 * 60);
      await job.discard();
    } catch (error) {
      Logger.error(error);
    }

    res.json({
      status: "cancelled"
    });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
