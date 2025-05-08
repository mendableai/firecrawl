import { supabase_rr_service, supabase_service } from "../../services/supabase";
import { logger } from "../logger";

import { withAuth } from "../withAuth";

async function getTeamIdSyncBOriginal(teamId: string) {
  try {
    const { data, error } = await supabase_rr_service
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

export const getTeamIdSyncB = withAuth(getTeamIdSyncBOriginal, null);
