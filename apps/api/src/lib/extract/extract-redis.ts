import { redisConnection } from "../../services/queue-service";
import { logger as _logger } from "../logger";

export type StoredExtract = {
  id: string;
  team_id: string;
  plan?: string;
  createdAt: number;
  status: "processing" | "completed" | "failed" | "cancelled";
  error?: any;
};

export async function saveExtract(id: string, extract: StoredExtract) {
  _logger.debug("Saving extract " + id + " to Redis...");
  await redisConnection.set("extract:" + id, JSON.stringify(extract));
  await redisConnection.expire("extract:" + id, 24 * 60 * 60, "NX");
}

export async function getExtract(id: string): Promise<StoredExtract | null> {
  const x = await redisConnection.get("extract:" + id);
  return x ? JSON.parse(x) : null;
}

export async function updateExtract(
  id: string,
  extract: Partial<StoredExtract>,
) {
  const current = await getExtract(id);
  if (!current) return;
  await redisConnection.set(
    "extract:" + id,
    JSON.stringify({ ...current, ...extract }),
  );
  await redisConnection.expire("extract:" + id, 24 * 60 * 60, "NX");
}

export async function getExtractExpiry(id: string): Promise<Date> {
  const d = new Date();
  const ttl = await redisConnection.pttl("extract:" + id);
  d.setMilliseconds(d.getMilliseconds() + ttl);
  d.setMilliseconds(0);
  return d;
}
