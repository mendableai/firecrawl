import { supabase_service } from "../../services/supabase";
import { logger } from "../logger";

export async function getTeamIdSyncB(teamId: string) {
  try {
    const { data, error } = await supabase_service
      .from("eb-sync")
      .select("team_id")
      .eq("team_id", teamId)
      .limit(1);
    if (error) {
      throw new Error("Error getting team id (sync b)");
    }
    return data[0] ?? null;
  } catch (error) {
    logger.error("Error getting team id (sync b)", error);
    return null;
  }
}
