import { config } from "../config";
import { redisRateLimitClient } from "../services/rate-limiter";
import { logger } from "./logger";

// The free indexes (gov, research) are reachable through their dedicated
// endpoints and as Alexandria providers, which the Exchange calls in-cluster,
// past the per-minute limiters, up to 10 calls per request. One bulk caller
// can saturate an index for everyone, so every path spends from one per-team
// budget per index per UTC day, one unit per call: a 10-call batch spends 10.
// An index whose limit is unset is not enforced.

export type FreeIndex = "gov" | "research";

const INDEXES: Record<
  FreeIndex,
  {
    label: string;
    provider: string;
    endpointKinds: string[];
    limit: () => number | undefined;
  }
> = {
  gov: {
    label: "government index",
    provider: "firecrawl-gov-index",
    endpointKinds: ["gov_search"],
    limit: () => config.GOV_INDEX_CALLS_PER_DAY,
  },
  research: {
    label: "research index",
    provider: "firecrawl-research-index",
    endpointKinds: [
      "research_paper_search",
      "research_related_papers",
      "research_paper_read",
      "research_paper_inspect",
    ],
    limit: () => config.RESEARCH_INDEX_CALLS_PER_DAY,
  },
};

const FREE_INDEXES = Object.keys(INDEXES) as FreeIndex[];

export type IndexCalls = Partial<Record<FreeIndex, number>>;

/** Free-index calls in an Alexandria batch, by index. */
export function indexCallsForProviders(
  calls: { provider: string }[],
): IndexCalls {
  const usage: IndexCalls = {};
  for (const index of FREE_INDEXES) {
    const count = calls.filter(
      call => call.provider === INDEXES[index].provider,
    ).length;
    if (count > 0) usage[index] = count;
  }
  return usage;
}

/** The free index a dedicated research-proxy endpoint reads, if any. */
export function indexForEndpointKind(kind: string): FreeIndex | undefined {
  return FREE_INDEXES.find(index =>
    INDEXES[index].endpointKinds.includes(kind),
  );
}

export type IndexDailyReservation =
  | {
      ok: true;
      /** Gives the reserved calls back, for a request refused before it ran. */
      release: () => Promise<void>;
    }
  | {
      ok: false;
      index: FreeIndex;
      used: number;
      limit: number;
      requested: number;
      retryAfterSeconds: number;
    };

// An unreachable Redis queues commands instead of failing, so bound the wait
// to keep the fail-open promise.
const REDIS_TIMEOUT_MS = 500;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Redis did not answer in time")),
        REDIS_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

const noRelease = async () => {};

function secondsUntilNextUtcDay(now: Date): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * Atomically reserves `usage` from the team's daily budgets. A request that
 * does not fit every budget is refused whole and spends nothing. Fails open: a
 * Redis outage must not take the indexes down with it.
 */
export async function reserveIndexDailyCalls(
  teamId: string,
  usage: IndexCalls,
  now = new Date(),
): Promise<IndexDailyReservation> {
  const requested = FREE_INDEXES.filter(
    index => (usage[index] ?? 0) > 0 && INDEXES[index].limit() !== undefined,
  );
  if (requested.length === 0) return { ok: true, release: noRelease };

  const day = now.toISOString().slice(0, 10);
  const ttl = secondsUntilNextUtcDay(now);
  const keys = requested.map(
    index => `index-daily-calls:${index}:${teamId}:${day}`,
  );
  const args = requested.flatMap(index => [
    usage[index]!,
    INDEXES[index].limit()!,
  ]);

  const pending = Promise.resolve().then(() =>
    redisRateLimitClient.eval(
      `
local ttl = ARGV[#ARGV]
for i, key in ipairs(KEYS) do
  local current = tonumber(redis.call("GET", key) or "0")
  if current + tonumber(ARGV[2 * i - 1]) > tonumber(ARGV[2 * i]) then
    return {0, i, current}
  end
end
for i, key in ipairs(KEYS) do
  local calls = tonumber(ARGV[2 * i - 1])
  if redis.call("INCRBY", key, calls) == calls then
    redis.call("EXPIRE", key, ttl)
  end
end
return {1, 0, 0}
`,
      keys.length,
      ...keys,
      ...args,
      ttl,
    ),
  ) as Promise<[number, number, number]>;
  const release = () => releaseCalls(teamId, keys, requested, usage);

  try {
    const [admitted, refused, used] = await withTimeout(pending);

    if (admitted === 1) return { ok: true, release };
    const index = requested[refused - 1];
    const reservation = {
      ok: false as const,
      index,
      used: Number(used),
      limit: INDEXES[index].limit()!,
      requested: usage[index]!,
      retryAfterSeconds: ttl,
    };
    logger.warn("Free index daily limit reached", { teamId, ...reservation });
    return reservation;
  } catch (error) {
    logger.warn("Free index daily limit check failed; allowing request", {
      teamId,
      error,
    });
    // The command may still land once Redis answers. A request refused before
    // it ran gives back whatever that late reservation took, without waiting.
    return {
      ok: true,
      release: async () => {
        void pending
          .then(([admitted]) => (admitted === 1 ? release() : undefined))
          .catch(() => {});
      },
    };
  }
}

// Best effort: the counters are on the reserved day's keys, clamped at zero.
async function releaseCalls(
  teamId: string,
  keys: string[],
  requested: FreeIndex[],
  usage: IndexCalls,
): Promise<void> {
  try {
    await withTimeout(
      redisRateLimitClient.eval(
        `
for i, key in ipairs(KEYS) do
  local current = tonumber(redis.call("GET", key) or "0")
  if current > 0 then
    redis.call("DECRBY", key, math.min(current, tonumber(ARGV[i])))
  end
end
return 1
`,
        keys.length,
        ...keys,
        ...requested.map(index => usage[index]!),
      ),
    );
  } catch (error) {
    logger.warn("Free index daily limit release failed", { teamId, error });
  }
}

export function indexDailyLimitMessage(
  reservation: Extract<IndexDailyReservation, { ok: false }>,
): string {
  const { label } = INDEXES[reservation.index];
  return `Daily ${label} limit reached: this team has used ${reservation.used} of ${reservation.limit} ${label} calls today and this request needs ${reservation.requested}. The limit resets at 00:00 UTC, in ${reservation.retryAfterSeconds}s. Contact help@firecrawl.com for bulk access.`;
}
