import { beforeEach, describe, expect, it, vi } from "vitest";

const { counters, redisEval } = vi.hoisted(() => {
  const counters = new Map<string, number>();
  // Mirrors the reservation script: every budget must fit, or nothing is spent.
  const redisEval = vi.fn(
    async (
      script: string,
      keyCount: number,
      ...rest: unknown[]
    ): Promise<unknown> => {
      const keys = rest.slice(0, keyCount) as string[];
      const args = rest.slice(keyCount) as number[];
      if (script.includes("DECRBY")) {
        for (const [i, key] of keys.entries())
          counters.set(key, Math.max(0, (counters.get(key) ?? 0) - args[i]));
        return 1;
      }
      for (const [i, key] of keys.entries()) {
        const current = counters.get(key) ?? 0;
        if (current + args[2 * i] > args[2 * i + 1]) return [0, i + 1, current];
      }
      for (const [i, key] of keys.entries())
        counters.set(key, (counters.get(key) ?? 0) + args[2 * i]);
      return [1, 0, 0];
    },
  );
  return { counters, redisEval };
});

vi.mock("../../services/rate-limiter", () => ({
  redisRateLimitClient: { eval: redisEval },
}));

const limits = vi.hoisted(() => ({
  GOV_INDEX_CALLS_PER_DAY: 500,
  RESEARCH_INDEX_CALLS_PER_DAY: undefined as number | undefined,
}));
vi.mock("../../config", () => ({ config: limits }));

import {
  indexCallsForProviders,
  indexForEndpointKind,
  reserveIndexDailyCalls,
} from "../index-daily-limit";

const NOW = new Date("2026-10-15T03:00:00Z");

describe("index daily limit", () => {
  beforeEach(() => {
    counters.clear();
    redisEval.mockClear();
    limits.RESEARCH_INDEX_CALLS_PER_DAY = 500;
  });

  it("maps Alexandria providers and endpoints to their index", () => {
    expect(
      indexCallsForProviders([
        { provider: "firecrawl-gov-index" },
        { provider: "firecrawl-gov-index" },
        { provider: "firecrawl-research-index" },
        { provider: "firecrawl-developer-index" },
      ]),
    ).toEqual({ gov: 2, research: 1 });
    expect(indexForEndpointKind("gov_search")).toBe("gov");
    expect(indexForEndpointKind("research_paper_read")).toBe("research");
    expect(indexForEndpointKind("code_search")).toBeUndefined();
  });

  it("refuses a batch whole when any index is over its daily limit", async () => {
    expect(
      await reserveIndexDailyCalls("team", { research: 495 }, NOW),
    ).toMatchObject({ ok: true });
    expect(
      await reserveIndexDailyCalls("team", { gov: 3, research: 10 }, NOW),
    ).toEqual({
      ok: false,
      index: "research",
      used: 495,
      limit: 500,
      requested: 10,
      retryAfterSeconds: 21 * 3600,
    });
    expect(counters.get("index-daily-calls:gov:team:2026-10-15")).toBe(
      undefined,
    );
    expect(
      await reserveIndexDailyCalls("team", { gov: 3, research: 5 }, NOW),
    ).toMatchObject({ ok: true });
  });

  it("gives reserved calls back on release", async () => {
    const reservation = await reserveIndexDailyCalls("team", { gov: 500 }, NOW);
    expect(reservation.ok).toBe(true);
    if (reservation.ok) await reservation.release();
    expect(counters.get("index-daily-calls:gov:team:2026-10-15")).toBe(0);
    expect(
      await reserveIndexDailyCalls("team", { gov: 500 }, NOW),
    ).toMatchObject({ ok: true });
  });

  it("does not limit an index whose limit is unset", async () => {
    limits.RESEARCH_INDEX_CALLS_PER_DAY = undefined;
    expect(
      await reserveIndexDailyCalls("team", { research: 10_000 }, NOW),
    ).toMatchObject({ ok: true });
    expect(redisEval).not.toHaveBeenCalled();
  });

  it("gives back a reservation that lands after the timeout", async () => {
    vi.useFakeTimers();
    let land!: () => void;
    redisEval.mockImplementationOnce(
      (...args: Parameters<typeof redisEval>) =>
        new Promise(resolve => {
          land = () => resolve(redisEval.getMockImplementation()!(...args));
        }),
    );
    const reserving = reserveIndexDailyCalls("team", { gov: 7 }, NOW);
    await vi.advanceTimersByTimeAsync(500);
    const reservation = await reserving;
    vi.useRealTimers();
    expect(reservation.ok).toBe(true);
    if (reservation.ok) await reservation.release();
    land();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(counters.get("index-daily-calls:gov:team:2026-10-15")).toBe(0);
  });

  it("allows the request when Redis is unavailable", async () => {
    redisEval.mockRejectedValueOnce(new Error("redis down"));
    expect(await reserveIndexDailyCalls("team", { gov: 1 }, NOW)).toMatchObject(
      {
        ok: true,
      },
    );
  });
});
