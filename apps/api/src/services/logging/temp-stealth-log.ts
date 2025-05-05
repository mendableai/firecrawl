import { cacheRedis } from "../../lib/cache";
import { logger } from "../../lib/logger";
import { supabase_service } from "../supabase";

export async function logStealthUsage(team_id: string) {
  try {
    let useCache = true;
    if (!cacheRedis) {
      useCache = false;
    }
    // Check Redis first
    const redisKey = `stealth_usage:${team_id}`;
    const exists = useCache ? await cacheRedis?.get(redisKey) : false;

    if (exists) {
      return;
    }

    // Check DB if not in Redis
    const { data } = await supabase_service
      .from("stealth_usage")
      .select("team_id")
      .eq("team_id", team_id);

    if (!data?.length) {
      // Insert into DB
      const { error } = await supabase_service.from("stealth_usage").insert([
        {
          team_id,
        },
      ]);

      if (error) {
        logger.error("Failed to log stealth usage", { error, team_id });
        return;
      }
    }
    // Cache in Redis for future lookups
    await cacheRedis?.set(redisKey, "1", "EX", 60 * 60 * 24 * 10); // Cache for 10 days
  } catch (err) {
    logger.error("Error logging stealth usage", { error: err, team_id });
  }
}
