import { supabase_service } from "../supabase";
import { Logger } from "../../../src/lib/logger";
import { configDotenv } from "dotenv";
configDotenv();

export async function logCrawl(job_id: string, team_id: string) {
  const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
  if (useDbAuthentication) {
    try {
      const { data, error } = await supabase_service
      .from("bulljobs_teams")
      .insert([
        {
          job_id: job_id,
          team_id: team_id,
        },
      ]);
    } catch (error) {
      Logger.error(`Error logging crawl job to supabase:\n${error}`);
    }
  }
}
