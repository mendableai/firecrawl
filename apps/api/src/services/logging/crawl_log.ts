import { supabase_service } from "../supabase";
import "dotenv/config";

export async function logCrawl(job_id: string, team_id: string) {
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
