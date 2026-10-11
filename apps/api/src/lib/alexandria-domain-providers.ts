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
 * for every team. Unmatched hosts are cached as well. Failures resolve to
 * undefined, never to an empty list, so an outage is not read as "no
 * provider"; they are cached briefly so an unavailable Exchange is not called
 * on every request.
 */
const MATCH_TTL_MS = 10 * 60_000;
const ERROR_TTL_MS = 30_000;
const LOOKUP_TIMEOUT_MS = 5_000;
const MAX_CACHED_HOSTS = 10_000;
const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

const resolveResponseSchema = z.object({
  skills: z.array(z.object({ id: z.string() })),
});

type Providers = string[] | undefined;

const cache = new Map<string, { providers: Providers; expiresAt: number }>();
const inFlight = new Map<string, Promise<Providers>>();

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

function remember(host: string, providers: Providers, ttlMs: number): void {
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
 * returned promise never rejects: it resolves to the matching providers (an
 * empty list when none match) or to undefined when the lookup failed.
 */
export function lookupDomainProviders(
  url: unknown,
  teamId: string,
): Promise<Providers> | undefined {
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
      remember(host, undefined, ERROR_TTL_MS);
      return undefined;
    })
    .finally(() => inFlight.delete(host));
  inFlight.set(host, lookup);
  return lookup;
}

/**
 * The lookup's providers if it succeeds within `ms`; undefined when it is
 * late or failed.
 */
export async function domainProvidersWithin(
  lookup: Promise<Providers>,
  ms: number,
): Promise<Providers> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = Symbol("late");
  const timeout = new Promise<typeof late>(resolve => {
    timer = setTimeout(() => resolve(late), ms);
  });
  try {
    const providers = await Promise.race([lookup, timeout]);
    if (providers !== late) return providers;
    alexandriaDomainLookupsTotal.inc({ outcome: "late" });
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export function clearDomainProviderCache(): void {
  cache.clear();
  inFlight.clear();
}
