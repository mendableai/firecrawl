import { config } from "../config";
import { redisRateLimitClient } from "../services/rate-limiter";
import { logger } from "./logger";

type GovIndexDailyReservation =
  | { ok: true; release: () => Promise<void> }
  | {
      ok: false;
      used: number;
      limit: number;
      requested: number;
      retryAfterSeconds: number;
    };

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

export async function reserveGovIndexCalls(
  teamId: string,
  calls: number,
  now = new Date(),
): Promise<GovIndexDailyReservation> {
  if (calls <= 0) return { ok: true, release: async () => {} };

  const limit = config.GOV_INDEX_CALLS_PER_DAY;
  const day = now.toISOString().slice(0, 10);
  const resetAt = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) /
      1000,
  );
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(resetAt - now.getTime() / 1000),
  );
  const key = `index-daily-calls:gov:${teamId}:${day}`;
  const pending = Promise.resolve().then(() =>
    redisRateLimitClient.eval(
      `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local calls = tonumber(ARGV[1])
if current + calls > tonumber(ARGV[2]) then
  return {0, current}
end
redis.call("INCRBY", KEYS[1], calls)
redis.call("EXPIREAT", KEYS[1], ARGV[3])
return {1, current}
`,
      1,
      key,
      calls,
      limit,
      resetAt,
    ),
  ) as Promise<[number, number]>;

  let releasePromise: Promise<void> | undefined;
  const release = () =>
    (releasePromise ??= (async () => {
      try {
        await withTimeout(
          redisRateLimitClient.eval(
            `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current > 0 then
  redis.call("DECRBY", KEYS[1], math.min(current, tonumber(ARGV[1])))
end
return 1
`,
            1,
            key,
            calls,
          ),
        );
      } catch (error) {
        logger.warn("Government index daily limit release failed", {
          teamId,
          error,
        });
      }
    })());

  try {
    const [admitted, used] = await withTimeout(pending);
    if (admitted === 1) return { ok: true, release };
    return {
      ok: false,
      used: Number(used),
      limit,
      requested: calls,
      retryAfterSeconds,
    };
  } catch (error) {
    logger.warn("Government index daily limit check failed; allowing request", {
      teamId,
      error,
    });
    let releaseScheduled = false;
    return {
      ok: true,
      release: async () => {
        if (releaseScheduled) return;
        releaseScheduled = true;
        void pending
          .then(([admitted]) => (admitted === 1 ? release() : undefined))
          .catch(() => {});
      },
    };
  }
}

export function govIndexDailyLimitMessage(
  reservation: Extract<GovIndexDailyReservation, { ok: false }>,
): string {
  return `Daily government index limit reached: this team has used ${reservation.used} of ${reservation.limit} government index calls today and this request needs ${reservation.requested}. The limit resets at 00:00 UTC, in ${reservation.retryAfterSeconds}s. Contact help@firecrawl.com for bulk access.`;
}
