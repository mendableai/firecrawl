import { Logger } from "../../../src/lib/logger";
import "dotenv/config";
import db from "../db";
import { bulljobsTeams } from "../db/schema";

export async function logCrawl(job_id: string, team_id: string) {
  if (process.env.USE_DB_AUTHENTICATION === 'true') {
    try {
      await db.insert(bulljobsTeams).values({
        jobId: job_id,
        teamId: team_id,
      })
    } catch (error) {
      Logger.error(`Error logging crawl job to supabase:\n${error}`);
    }
  }
}
