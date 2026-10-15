import { Counter, Histogram } from "prom-client";

// Fixed labels only: never team ids or anything from the page.

export const brandingRoutedTotal = new Counter({
  name: "firecrawl_branding_routed_total",
  help: "Branding requests by the model they were sent to and why: jev (rollout), or llm when the team isn't in the rollout, Jev was unavailable, or Jev was unsure of the logo; counted before the model answers",
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
