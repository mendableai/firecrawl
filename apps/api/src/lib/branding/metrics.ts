import { Counter, Gauge, Histogram } from "prom-client";
import { config } from "../../config";

// Fixed labels only: never team ids or anything from the page.

export const brandingRoutedTotal = new Counter({
  name: "firecrawl_branding_routed_total",
  help: "Each branding request once, by the model it was finally sent to and why: jev (rollout), or llm when the team isn't in the rollout, Jev was unavailable (failed or breaker open), or Jev was unsure of the logo; every Jev attempt is in firecrawl_branding_jev_calls_total",
  labelNames: ["model", "reason"],
});

export const brandingJevCallsTotal = new Counter({
  name: "firecrawl_branding_jev_calls_total",
  help: "Jev branding call outcomes; shadow calls are labelled separately",
  labelNames: ["outcome", "shadow"],
});

export const brandingJevBreakerOpensTotal = new Counter({
  name: "firecrawl_branding_jev_breaker_opens_total",
  help: "Times the Jev breaker opened and sent branding to the LLM for its cooldown",
});

export const brandingJevDurationSeconds = new Histogram({
  name: "firecrawl_branding_jev_duration_seconds",
  help: "Jev branding call time, for calls that reached TypeSafe",
  labelNames: ["shadow"],
  // Up to the default timeout with its one retry.
  buckets: [0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10],
});

// Each pod reports the share it was started with; pods that disagree are
// running an older config.
export const brandingJevRolloutPercent = new Gauge({
  name: "firecrawl_branding_jev_rollout_percent",
  help: "Share of teams this process sends to Jev, from its own config: 0 without a TypeSafe key, 100 with BRANDING_JEV on, else BRANDING_JEV_ROLLOUT_PERCENT",
  collect() {
    this.set(effectiveJevRolloutPercent());
  },
});

function effectiveJevRolloutPercent(): number {
  if (!config.TYPESAFE_API_KEY) return 0;
  if (config.BRANDING_JEV === true) return 100;
  return config.BRANDING_JEV_ROLLOUT_PERCENT;
}

export type JevCallOutcome =
  | "ok"
  | "timeout"
  | "rate_limited"
  | "error"
  | "unusable"
  | "breaker_open";

// Export quiet series before their first event, so rates read 0, not missing.
for (const [model, reason] of [
  ["jev", "rollout"],
  ["llm", "not_in_rollout"],
  ["llm", "jev_unavailable"],
  ["llm", "logo_escalation"],
]) {
  brandingRoutedTotal.inc({ model, reason }, 0);
}
for (const shadow of ["true", "false"]) {
  for (const outcome of [
    "ok",
    "timeout",
    "rate_limited",
    "error",
    "unusable",
    "breaker_open",
  ] satisfies JevCallOutcome[]) {
    brandingJevCallsTotal.inc({ outcome, shadow }, 0);
  }
}
brandingJevBreakerOpensTotal.inc(0);
