import { logger } from "../../lib/logger";
import { supabase_service } from "../supabase";

export async function issueCredits(team_id: string, credits: number) {
  // Add an entry to supabase coupons
  const { error } = await supabase_service.from("coupons").insert({
    team_id: team_id,
    credits: credits,
    status: "active",
    // indicates that this coupon was issued from auto recharge
    from_auto_recharge: true,
    initial_credits: credits,
  });

  if (error) {
    logger.error(`Error adding coupon: ${error}`);
    return false;
  }

  return true;
}
