import { config } from "../../config";

/**
 * Capabilities whose successful results get a public page at
 * firecrawl.dev/artifacts/<jobId>. Everything not listed here is never stored.
 *
 * `params` names the only options copied into the public record, with the
 * shape each must have; any other option (and any value of the wrong shape)
 * is dropped. Free-text options stay out.
 *
 * `enabled: false` on a provider is the in-code kill switch;
 * ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS is the deploy-time one. Both are
 * checked on write and again on every read.
 */
export type PublicParamKind = "string" | "number" | "boolean" | "string[]";

export type PublicCapability = {
  params: Record<string, PublicParamKind>;
  /** Store only when the payload's top-level `tags` carry this slug. */
  requiredTag?: string;
};

type PublicProvider = {
  enabled: boolean;
  capabilities: Record<string, PublicCapability>;
};

const ESPN_LEAGUE = { sport: "string", league: "string" } as const;
const POLYMARKET_SPORTS = "sports";

const PUBLIC_RESULT_PROVIDERS: Record<string, PublicProvider> = {
  "espn-com": {
    enabled: true,
    capabilities: {
      "sports-data/scoreboard": {
        params: {
          ...ESPN_LEAGUE,
          date: "string",
          season: "number",
          seasontype: "number",
          week: "number",
          groups: "string",
          limit: "number",
        },
      },
      "sports-data/event": {
        params: { ...ESPN_LEAGUE, event_id: "string" },
      },
      "sports-data/standings": {
        params: {
          ...ESPN_LEAGUE,
          season: "number",
          level: "number",
          stats: "string[]",
        },
      },
    },
  },
  "nfl-com": {
    enabled: true,
    capabilities: {
      "sports-league-data/injury_report": {
        params: {
          season: "number",
          season_type: "string",
          team: "string",
          week: "number",
        },
      },
    },
  },
  "fantasyfootballcalculator-com": {
    enabled: true,
    capabilities: {
      "fantasy-sports-rankings/adp": {
        params: {
          format: "string",
          teams: "number",
          year: "number",
          position: "string",
          limit: "number",
        },
      },
    },
  },
  // Polymarket is multi-category; only sports-tagged events and markets.
  polymarket: {
    enabled: true,
    capabilities: {
      "events/by-slug": {
        params: { slug: "string" },
        requiredTag: POLYMARKET_SPORTS,
      },
      "events/get": {
        params: { id: "number" },
        requiredTag: POLYMARKET_SPORTS,
      },
      "markets/by-slug": {
        params: { slug: "string", include_tag: "boolean" },
        requiredTag: POLYMARKET_SPORTS,
      },
      "markets/get": {
        params: { id: "number", include_tag: "boolean" },
        requiredTag: POLYMARKET_SPORTS,
      },
    },
  },
};

/**
 * The allowlist entry for a capability, or undefined when public results are
 * off, the provider is switched off, or the capability is not listed.
 */
export function publicCapability(
  provider: string,
  capability: string,
): PublicCapability | undefined {
  if (!config.ALEXANDRIA_PUBLIC_RESULTS_ENABLED) return undefined;
  if (
    (config.ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS ?? []).includes(
      provider,
    )
  )
    return undefined;
  const entry = Object.hasOwn(PUBLIC_RESULT_PROVIDERS, provider)
    ? PUBLIC_RESULT_PROVIDERS[provider]
    : undefined;
  if (!entry?.enabled || !Object.hasOwn(entry.capabilities, capability))
    return undefined;
  return entry.capabilities[capability];
}
