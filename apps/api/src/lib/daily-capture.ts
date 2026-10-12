import { redisRateLimitClient } from "../services/rate-limiter";
import {
  capturePostHog,
  isPostHogCaptureEnabled,
} from "../services/posthog-capture";
import { logger } from "./logger";

// One UTC day plus an hour, so a marker outlives the day it is keyed on.
const DEDUPE_TTL_SECONDS = 25 * 60 * 60;

/**
 * Capture a PostHog event at most once per dedupe key. The marker is a Redis
 * SET NX with a 25h TTL (callers put the UTC day in the key), released when
 * the capture fails so a later call retries. Fire-and-forget: never awaited
 * in the request path, never throws, and spends no marker while capture is
 * off.
 */
export function captureOncePerDay(input: {
  dedupeKey: string;
  event: string;
  distinctId: string;
  properties: Record<string, unknown>;
  module: string;
}): void {
  if (!isPostHogCaptureEnabled()) return;

  void (async () => {
    try {
      const first = await redisRateLimitClient.set(
        input.dedupeKey,
        "1",
        "EX",
        DEDUPE_TTL_SECONDS,
        "NX",
      );
      if (first !== "OK") return;

      const sent = await capturePostHog(
        input.event,
        input.distinctId,
        input.properties,
      );
      if (!sent) await redisRateLimitClient.del(input.dedupeKey);
    } catch (error) {
      logger.debug(`${input.event} capture failed`, {
        module: input.module,
        error,
      });
    }
  })();
}
