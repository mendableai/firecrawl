import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

const config = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: undefined as string | undefined,
  ALEXANDRIA_QUERY_INFERENCE: false,
  ALEXANDRIA_AUTO_TOOLS: false,
}));

vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("../config", () => ({ config }));
vi.mock("../lib/generic-ai", () => ({ getModel: vi.fn(() => "model") }));
vi.mock("../services/rate-limiter", () => ({
  redisRateLimitClient: { get: mocks.get, set: mocks.set },
}));

import {
  autoToolsEnabled,
  inferToolIntent,
  parseSearchQuery,
  queryInferenceEnabled,
} from "./tool-intent";

const logger = { warn: vi.fn() } as any;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(null);
  mocks.set.mockResolvedValue("OK");
});

describe("parseSearchQuery", () => {
  it.each([
    [
      "site:linkedin.com sundar pichai",
      { text: "sundar pichai", domains: ["linkedin.com"] },
    ],
    [
      "stripe.com traffic",
      { text: "stripe.com traffic", domains: ["stripe.com"] },
    ],
    ['"elon musk" tweets -retweets', { text: "elon musk tweets", domains: [] }],
    [
      "node.js filetype:pdf streams OR buffers",
      { text: "node.js streams buffers", domains: [] },
    ],
    ["site:https://www.SEC.gov/edgar", { text: "", domains: ["sec.gov"] }],
    ['site:"cnbc.com" nvidia', { text: "nvidia", domains: ["cnbc.com"] }],
  ])("parses %s", (query, expected) => {
    expect(parseSearchQuery(query)).toEqual(expected);
  });
});

describe("inferToolIntent", () => {
  it("returns cleaned model rewrites with the parsed domains", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        needsTools: true,
        toolQueries: [" posts by a user on X ", "posts by a user on X", ""],
        domains: ["https://x.com/", "not a host"],
      },
    });
    const intent = await inferToolIntent(
      "site:twitter.com elon musk posts",
      logger,
    );
    expect(intent).toEqual({
      toolQueries: ["posts by a user on X"],
      domains: ["twitter.com", "x.com"],
      needsTools: true,
    });
    expect(mocks.generateObject.mock.calls[0][0].prompt).toContain(
      "elon musk posts",
    );
    expect(mocks.set).toHaveBeenCalled();
  });

  it("serves a cached answer without calling the model", async () => {
    mocks.get.mockResolvedValue(
      JSON.stringify({
        toolQueries: ["institutional holders of a public company"],
        domains: [],
        needsTools: true,
      }),
    );
    const intent = await inferToolIntent("who owns apple stock", logger);
    expect(intent.toolQueries).toEqual([
      "institutional holders of a public company",
    ]);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it("falls back to the parsed query when the model fails", async () => {
    mocks.generateObject.mockRejectedValue(new Error("unavailable"));
    const intent = await inferToolIntent('"nvidia" news site:cnbc.com', logger);
    expect(intent).toEqual({
      toolQueries: ["nvidia news"],
      domains: ["cnbc.com"],
    });
  });
});

describe("feature gates", () => {
  it("stay off without an Anthropic key, even for flagged teams", () => {
    config.ANTHROPIC_API_KEY = undefined;
    const flags = { alexandriaQueryInference: true, alexandriaAutoTools: true };
    expect(queryInferenceEnabled(flags)).toBe(false);
    expect(autoToolsEnabled(flags)).toBe(false);
    config.ANTHROPIC_API_KEY = "key";
    expect(queryInferenceEnabled(flags)).toBe(true);
    expect(autoToolsEnabled(flags)).toBe(true);
    expect(queryInferenceEnabled({})).toBe(false);
  });
});

it("sends no semantic query for an operator-only query", async () => {
  const intent = await inferToolIntent("site:sec.gov filetype:pdf", logger);
  expect(intent).toEqual({ toolQueries: [], domains: ["sec.gov"] });
  expect(mocks.generateObject).not.toHaveBeenCalled();
});
