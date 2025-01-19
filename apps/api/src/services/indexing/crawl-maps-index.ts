import { logger } from "../../lib/logger";
import {
  normalizeUrl,
  normalizeUrlOnlyHostname,
} from "../../lib/canonical-url";
import { supabase_service } from "../supabase";
import { redisConnection } from "../queue-service";

const BATCH_KEY = "crawl_maps_batch";
const BATCH_LOCK_KEY = "crawl_maps_batch_lock";
const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 10000; // 10 seconds
const LOCK_TIMEOUT = 30000; // 30 seconds

interface CrawlMapOperation {
  originUrl: string;
  standardizedUrls: string[];
  timestamp: string;
}

async function acquireLock(): Promise<boolean> {
  const redis = redisConnection;
  // Set lock with NX (only if it doesn't exist) and PX (millisecond expiry)
  const result = await redis.set(BATCH_LOCK_KEY, "1", "PX", LOCK_TIMEOUT, "NX");
  const acquired = result === "OK";
  if (acquired) {
    logger.info("🔒 Acquired batch processing lock");
  }
  return acquired;
}

async function releaseLock() {
  const redis = redisConnection;
  await redis.del(BATCH_LOCK_KEY);
  logger.info("🔓 Released batch processing lock");
}

async function processBatch() {
  const redis = redisConnection;

  // Try to acquire lock
  if (!(await acquireLock())) {
    return;
  }

  try {
    // Get all operations from Redis list
    const operations: CrawlMapOperation[] = [];
    while (operations.length < BATCH_SIZE) {
      const op = await redis.lpop(BATCH_KEY);
      if (!op) break;
      operations.push(JSON.parse(op));
    }

    if (operations.length === 0) {
      logger.info("No operations to process in batch");
      return;
    }

    logger.info(`📦 Processing batch of ${operations.length} operations`, {
      origins: operations.map((op) => op.originUrl),
    });

    // Get existing maps for all origins in batch
    const origins = operations.map((op) => op.originUrl);
    const { data: existingMaps } = await supabase_service
      .from("crawl_maps")
      .select("origin_url, urls")
      .in("origin_url", origins);

    const existingMapsByOrigin = new Map(
      existingMaps?.map((map) => [map.origin_url, map.urls]) || [],
    );

    // Prepare updates and inserts
    interface CrawlMapRecord {
      origin_url: string;
      urls: string[];
      num_urls: number;
      updated_at: string;
      created_at?: string;
    }

    const updates: CrawlMapRecord[] = [];
    const inserts: CrawlMapRecord[] = [];

    for (const op of operations) {
      const existingUrls = existingMapsByOrigin.get(op.originUrl);

      if (existingUrls) {
        // Merge URLs for update
        const mergedUrls = [
          ...new Set([...existingUrls, ...op.standardizedUrls]),
        ];
        updates.push({
          origin_url: op.originUrl,
          urls: mergedUrls,
          num_urls: mergedUrls.length,
          updated_at: op.timestamp,
        });
      } else {
        // Prepare insert
        inserts.push({
          origin_url: op.originUrl,
          urls: op.standardizedUrls,
          num_urls: op.standardizedUrls.length,
          created_at: op.timestamp,
          updated_at: op.timestamp,
        });
      }
    }

    // Execute batch operations
    if (updates.length > 0) {
      logger.info(`🔄 Updating ${updates.length} existing crawl maps`, {
        origins: updates.map((u) => u.origin_url),
      });
      const { error: updateError } = await supabase_service
        .from("crawl_maps")
        .upsert(updates);

      if (updateError) {
        logger.error("Failed to batch update crawl maps", {
          error: updateError,
        });
      }
    }

    if (inserts.length > 0) {
      logger.info(`➕ Inserting ${inserts.length} new crawl maps`, {
        origins: inserts.map((i) => i.origin_url),
      });
      const { error: insertError } = await supabase_service
        .from("crawl_maps")
        .insert(inserts);

      if (insertError) {
        logger.error("Failed to batch insert crawl maps", {
          error: insertError,
        });
      }
    }

    logger.info("✅ Batch processing completed successfully");
  } catch (error) {
    logger.error("Error processing crawl map batch", { error });
  } finally {
    await releaseLock();
  }
}

// Start periodic batch processing
let batchInterval: NodeJS.Timeout | null = null;

function startBatchProcessing() {
  if (batchInterval) return;

  logger.info("🔄 Starting periodic batch processing");
  batchInterval = setInterval(async () => {
    const queueLength = await redisConnection.llen(BATCH_KEY);
    logger.info(`Checking batch queue (${queueLength} items pending)`);
    await processBatch();
  }, BATCH_TIMEOUT);

  // Unref to not keep process alive
  batchInterval.unref();
}

export async function saveCrawlMap(originUrl: string, visitedUrls: string[]) {
  logger.info("Queueing crawl map", { originUrl });
  originUrl = normalizeUrlOnlyHostname(originUrl);

  try {
    // Standardize URLs to canonical form
    const standardizedUrls = [
      ...new Set(visitedUrls.map((url) => normalizeUrl(url))),
    ];

    const operation: CrawlMapOperation = {
      originUrl,
      standardizedUrls,
      timestamp: new Date().toISOString(),
    };

    // Add operation to Redis list
    const redis = redisConnection;
    await redis.rpush(BATCH_KEY, JSON.stringify(operation));
    const queueLength = await redis.llen(BATCH_KEY);
    logger.info(`📥 Added operation to queue (${queueLength} total pending)`, {
      originUrl,
    });

    // Start batch processing if not already started
    startBatchProcessing();

    // If we have enough items, trigger immediate processing
    if (queueLength >= BATCH_SIZE) {
      logger.info(
        "🔄 Queue reached batch size, triggering immediate processing",
      );
      await processBatch();
    }
  } catch (error) {
    logger.error("Error queueing crawl map", { error });
  }
}

// Cleanup on exit
process.on("beforeExit", async () => {
  if (batchInterval) {
    clearInterval(batchInterval);
    batchInterval = null;
    logger.info("Stopped periodic batch processing");
  }
  await processBatch();
});
