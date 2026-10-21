import { beforeEach, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("../services/rate-limiter", () => ({
  redisRateLimitClient: {
    pipeline: () => {
      const writes: [string, string][] = [];
      const pipeline = {
        set: (key: string, value: string) => {
          writes.push([key, value]);
          return pipeline;
        },
        exec: async () => {
          for (const [key, value] of writes) store.set(key, value);
          return [];
        },
      };
      return pipeline;
    },
    mget: async (keys: string[]) => keys.map(key => store.get(key) ?? null),
  },
}));
import {
  discoveryForCalls,
  recordDiscoveredTools,
} from "./alexandria-discovery";

beforeEach(() => store.clear());

it("attributes a call to the latest search and find-tools jobs that showed it", async () => {
  const sponsors = { provider: "particle", capability: "advertising/sponsors" };
  recordDiscoveredTools("team", "search", "search-1", [sponsors]);
  recordDiscoveredTools("team", "find_tools", "scrape-1", [sponsors]);
  recordDiscoveredTools("team", "find_tools", "scrape-2", [sponsors]);
  await vi.waitFor(() => expect(store.size).toBe(2));

  const [found, missing] = await discoveryForCalls("team", [
    sponsors,
    { provider: "fred", capability: "series/search" },
  ]);
  expect(found).toEqual({
    search: { id: "search-1", secondsBefore: expect.any(Number) },
    find_tools: { id: "scrape-2", secondsBefore: expect.any(Number) },
  });
  expect(missing).toEqual({});
});

it("keeps teams apart", async () => {
  const tool = { provider: "fred", capability: "series/search" };
  recordDiscoveredTools("other-team", "search", "search-1", [tool]);
  await vi.waitFor(() => expect(store.size).toBe(1));
  expect(await discoveryForCalls("team", [tool])).toEqual([{}]);
});
