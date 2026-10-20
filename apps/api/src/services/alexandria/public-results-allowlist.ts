/**
 * Capabilities whose successful results get a public page at
 * firecrawl.dev/artifacts/<jobId>. Everything not listed here is never stored.
 *
 * `params` names the only options copied into the public record, with the
 * shape each must have; any other option (and any value of the wrong shape)
 * is dropped. Free-text options stay out.
 *
 * This list is the only gate, checked on write and again on every read. It
 * matches the layouts firecrawl-web renders (lib/alexandria/artifacts/registry.ts);
 * removing an entry hides its existing pages.
 */
export type PublicParamKind = "string" | "number" | "boolean" | "string[]";

export type PublicCapability = {
  params: Record<string, PublicParamKind>;
  /** Store only when the payload's top-level `tags` carry this slug. */
  requiredTag?: string;
};

const ESPN_LEAGUE = { sport: "string", league: "string" } as const;
const POLYMARKET_SPORTS = "sports";

const PUBLIC_RESULT_CAPABILITIES: Record<
  string,
  Record<string, PublicCapability>
> = {
  "espn-com": {
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
  "nfl-com": {
    "sports-league-data/injury_report": {
      params: {
        season: "number",
        season_type: "string",
        team: "string",
        week: "number",
      },
    },
  },
  "fantasyfootballcalculator-com": {
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
  // Polymarket is multi-category; only sports-tagged events and markets.
  polymarket: {
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
};

/** The allowlist entry for a capability, or undefined when it is not listed. */
export function publicCapability(
  provider: string,
  capability: string,
): PublicCapability | undefined {
  if (!Object.hasOwn(PUBLIC_RESULT_CAPABILITIES, provider)) return undefined;
  const capabilities = PUBLIC_RESULT_CAPABILITIES[provider];
  return Object.hasOwn(capabilities, capability)
    ? capabilities[capability]
    : undefined;
}
