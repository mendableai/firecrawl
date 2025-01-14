import { redisConnection } from "../../services/queue-service";
import { logger as _logger } from "../logger";

export enum ExtractStep {
  INITIAL = "initial",
  MULTI_ENTITY = "multi-entity",
  MULTI_ENTITY_SCRAPE = "multi-entity-scrape",
  MULTI_ENTITY_EXTRACT = "multi-entity-extract",
  SCRAPE = "scrape",
  MAP = "map",
  EXTRACT = "extract",
  COMPLETE = "complete",
}

export type ExtractedStep = {
  step: ExtractStep;
  startedAt: number;
  finishedAt: number;
  error?: any;
  discoveredLinks?: string[];
};

export type StoredExtract = {
  id: string;
  team_id: string;
  plan?: string;
  createdAt: number;
  status: "processing" | "completed" | "failed" | "cancelled";
  error?: any;
  showSteps?: boolean;
  steps?: ExtractedStep[];
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

  // Handle steps aggregation
  if (extract.steps && current.steps) {
    extract.steps = [...current.steps, ...extract.steps];
  }

  // Limit links in steps to 500
  if (extract.steps) {
    extract.steps = extract.steps.map(step => {
      if (step.discoveredLinks && step.discoveredLinks.length > 500) {
        return {
          ...step,
          discoveredLinks: step.discoveredLinks.slice(0, 500)
        };
      }
      return step;
    });
  }

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
