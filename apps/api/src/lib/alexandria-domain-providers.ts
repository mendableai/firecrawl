import { Counter } from "prom-client";
import { z } from "zod";
import { config } from "../config";
import { exchangeRequest } from "../services/alexandria/client";
import { logger } from "./logger";

/**
 * Alexandria providers whose tools cover a page's host, used only for agent
 * hints. A lookup starts when a request arrives and runs alongside it; callers
 * wait a bounded time for the result and skip it when it is late, so a lookup
 * never delays or fails the request it serves.
 *
 * Only the host is sent, and results are cached per host: the API always
 * requests the extended catalogue, so a host resolves to the same providers
 * for every team. Unmatched hosts are cached as well; failures are cached
 * briefly so an unavailable Exchange is not called on every request.
 */
const MATCH_TTL_MS = 10 * 60_000;
const ERROR_TTL_MS = 30_000;
const LOOKUP_TIMEOUT_MS = 5_000;
const MAX_CACHED_HOSTS = 10_000;
const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

const resolveResponseSchema = z.object({
  skills: z.array(z.object({ id: z.string() })),
});

const cache = new Map<string, { providers: string[]; expiresAt: number }>();
const inFlight = new Map<string, Promise<string[]>>();

export const alexandriaDomainLookupsTotal = new Counter({
  name: "alexandria_domain_lookups_total",
  help: "Alexandria domain provider lookups for agent hints, by outcome",
  labelNames: ["outcome"] as const,
});

function hostOf(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  const parsed = URL.parse(url);
  if (
    !parsed ||
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    return undefined;
  return parsed.hostname.toLowerCase().replace(/\.$/, "") || undefined;
}

function remember(host: string, providers: string[], ttlMs: number): void {
  cache.delete(host);
  if (cache.size >= MAX_CACHED_HOSTS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(host, { providers, expiresAt: Date.now() + ttlMs });
}

/**
 * Starts (or reuses) the provider lookup for a URL's host. Returns undefined
 * when Alexandria is not configured or the URL has no usable host. The
 * returned promise never rejects; a failed lookup resolves to no providers.
 */
export function lookupDomainProviders(
  url: unknown,
  teamId: string,
): Promise<string[]> | undefined {
  if (!config.FIRE_EXCHANGE_URL) return undefined;
  const host = hostOf(url);
  if (!host) return undefined;

  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now()) {
    alexandriaDomainLookupsTotal.inc({ outcome: "cache_hit" });
    return Promise.resolve(cached.providers);
  }
  const pending = inFlight.get(host);
  if (pending) return pending;

  alexandriaDomainLookupsTotal.inc({ outcome: "cache_miss" });
  const lookup = exchangeRequest({
    teamId,
    path: "/v1/skills/resolve",
    body: { urls: [`https://${host}/`] },
    timeoutMs: LOOKUP_TIMEOUT_MS,
  })
    .then(result => {
      if (result.status !== 200)
        throw new Error(`Domain resolve returned ${result.status}`);
      const providers = [
        ...new Set(
          resolveResponseSchema
            .parse(result.body)
            .skills.map(skill => skill.id)
            .filter(id => PROVIDER_ID.test(id)),
        ),
      ];
      remember(host, providers, MATCH_TTL_MS);
      return providers;
    })
    .catch(error => {
      alexandriaDomainLookupsTotal.inc({ outcome: "error" });
      logger.warn("Alexandria domain lookup failed", {
        module: "alexandria-domain-providers",
        error: error instanceof Error ? error.message : String(error),
      });
      remember(host, [], ERROR_TTL_MS);
      return [] as string[];
    })
    .finally(() => inFlight.delete(host));
  inFlight.set(host, lookup);
  return lookup;
}

/** The lookup's providers if it settles within `ms`, otherwise undefined. */
export async function domainProvidersWithin(
  lookup: Promise<string[]>,
  ms: number,
): Promise<string[] | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>(resolve => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    const providers = await Promise.race([lookup, late]);
    if (providers === undefined)
      alexandriaDomainLookupsTotal.inc({ outcome: "late" });
    return providers;
  } finally {
    clearTimeout(timer);
  }
}

export function clearDomainProviderCache(): void {
  cache.clear();
  inFlight.clear();
}
