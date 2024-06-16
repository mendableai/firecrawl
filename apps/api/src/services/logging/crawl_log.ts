import { supabase_service } from "../supabase";
import "dotenv/config";

export async function logCrawl(job_id: string, team_id: string) {
  if(process.env.USE_DB_AUTHENTICATION){  // Only log to the database if the USE_DB_AUTHENTICATION environment variable is set to true
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
      console.error("Error logging crawl job:\n", error);
    }
  }
}
