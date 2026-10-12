import type { BillingLinkReason } from "./billing-link";
import { captureOncePerDay } from "./daily-capture";
import type { KeylessSignupSurface } from "./keyless-signup-link";

/** Pairs with the web app's `billing_link_clicked`: same org, surface and reason. */
export const BILLING_LINK_SHOWN_EVENT = "billing_link_shown";

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
 * day, only for a link actually rendered into a hint. Fire-and-forget, never
 * throws.
 */
export function trackBillingLinkShown(shown: BillingLinkShown): void {
  captureOncePerDay({
    dedupeKey: billingLinkDedupeKey(shown),
    event: BILLING_LINK_SHOWN_EVENT,
    distinctId: shown.orgId,
    properties: {
      org_id: shown.orgId,
      surface: shown.surface,
      reason: shown.reason,
      http_status: shown.httpStatus,
      link_type: shown.tokenLink ? "token" : "fallback",
      // One event stream per org; do not create a person for it.
      $process_person_profile: false,
    },
    module: "billing-link-analytics",
  });
}
