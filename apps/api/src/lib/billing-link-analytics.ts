import { redisRateLimitClient } from "../services/rate-limiter";
import {
  capturePostHog,
  isPostHogCaptureEnabled,
} from "../services/posthog-capture";
import type { BillingLinkReason } from "./billing-link";
import type { KeylessSignupSurface } from "./keyless-signup-link";
import { logger } from "./logger";

/** Pairs with the web app's `billing_link_clicked`: same org, surface and reason. */
export const BILLING_LINK_SHOWN_EVENT = "billing_link_shown";

// One UTC day plus an hour, so a marker outlives the day it is keyed on.
const DEDUPE_TTL_SECONDS = 25 * 60 * 60;

type BillingLinkShown = {
  orgId: string;
  surface: KeylessSignupSurface;
  reason: BillingLinkReason;
  httpStatus: number;
  /** True when the hint carried a /billing/<token> link, false for the fallback link. */
  tokenLink: boolean;
};

export function billingLinkDedupeKey(
  shown: Pick<BillingLinkShown, "orgId" | "surface" | "reason">,
  now: Date = new Date(),
): string {
  const day = now.toISOString().slice(0, 10);
  return `billing_link_shown:${day}:${shown.orgId}:${shown.surface}:${shown.reason}`;
}

/**
 * Emit `billing_link_shown` at most once per (org, surface, reason) per UTC
 * day, only for a link actually rendered into a hint. The dedup marker is a
 * Redis SET NX, released when the capture fails so a later hint retries.
 * Fire-and-forget: never awaited in the request path, never throws.
 */
export function trackBillingLinkShown(shown: BillingLinkShown): void {
  // Bail before the SET NX so a marker is not spent while capture is off.
  if (!isPostHogCaptureEnabled()) return;

  void (async () => {
    try {
      const key = billingLinkDedupeKey(shown);
      const first = await redisRateLimitClient.set(
        key,
        "1",
        "EX",
        DEDUPE_TTL_SECONDS,
        "NX",
      );
      if (first !== "OK") return;

      const sent = await capturePostHog(BILLING_LINK_SHOWN_EVENT, shown.orgId, {
        org_id: shown.orgId,
        surface: shown.surface,
        reason: shown.reason,
        http_status: shown.httpStatus,
        link_type: shown.tokenLink ? "token" : "fallback",
        // One event stream per org; do not create a person for it.
        $process_person_profile: false,
      });
      // Release the marker so the next hint today retries the event.
      if (!sent) await redisRateLimitClient.del(key);
    } catch (error) {
      logger.debug("trackBillingLinkShown failed", {
        module: "billing-link-analytics",
        error,
      });
    }
  })();
}
