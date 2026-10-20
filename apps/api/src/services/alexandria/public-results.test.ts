const mocks = vi.hoisted(() => ({
  config: {
    ALEXANDRIA_PUBLIC_RESULTS_ENABLED: true,
    ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS: [] as string[],
    GCS_BUCKET_NAME: "bucket",
  },
  save: vi.fn(),
  download: vi.fn(),
  file: vi.fn(),
}));
vi.mock("../../config", () => ({ config: mocks.config }));
vi.mock("../../lib/gcs-jobs", () => ({
  storage: {
    bucket: () => ({
      file: (name: string) => {
        mocks.file(name);
        return { save: mocks.save, download: mocks.download };
      },
    }),
  },
}));
import { ApiError } from "@google-cloud/storage";
import {
  buildPublicRecord,
  createdViaFromOrigin,
  filterPublicParams,
  loadPublicResult,
  persistPublicResult,
  sanitizePublicPayload,
} from "./public-results";
import { publicCapability } from "./public-results-allowlist";

const jobId = "01a15270-ca7a-76bf-858e-53381c7a86f1";
const team = "6f3c1a3e-2b1d-4c5e-9f00-1234567890ab";
const scoreboard = {
  provider: "espn-com",
  capability: "sports-data/scoreboard",
  options: {
    sport: "football",
    league: "nfl",
    week: 7,
    seasontype: "2",
    query: "free text stays out",
  },
};
const scoreboardItem = {
  provider: "espn-com",
  capability: "sports-data/scoreboard",
  creditsCost: 5,
  alexandriaId: "abc",
  providerRequestId: "p-1",
  workflowRunId: "w-1",
  workflow: { version: "1.2.0", digest: "sha256:x" },
  data: {
    count: 1,
    events: [
      {
        event_id: "401873008",
        requestId: "inner",
        competitors: [{ team_id: "25", logo: "https://a.espncdn.com/sf.png" }],
      },
    ],
  },
};
const build = (overrides: Partial<Parameters<typeof buildPublicRecord>[0]>) =>
  buildPublicRecord({
    jobId,
    origin: "mcp-ua-openai-mcp@1.0.0",
    calls: [scoreboard],
    results: [scoreboardItem],
    unrestricted: new Set(["espn-com/sports-data/scoreboard"]),
    secrets: new Set([team]),
    now: new Date("2026-10-19T04:20:00.000Z"),
    ...overrides,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_ENABLED = true;
  mocks.config.ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS = [];
  mocks.config.GCS_BUCKET_NAME = "bucket";
});

describe("createdViaFromOrigin", () => {
  it.each([
    ["mcp-ua-openai-mcp@1.0.0", "chatgpt"],
    ["mcp-ua-claude-user@0.1", "claude"],
    ["mcp-claude-ai@2", "claude"],
    ["mcp-ua-claude-code@1", "claude"],
    ["mcp-claude-code@3.24.1", "claude"],
    ["MCP-Claude-Code", "claude"],
    ["mcp-fastmcp@2.0", "other"],
    ["api", "other"],
    ["python-sdk@4.0.0", "other"],
    ["mcp-ua-openai-mcp-fake@1", "other"],
    [undefined, "other"],
    [42, "other"],
  ])("%s -> %s", (origin, expected) => {
    expect(createdViaFromOrigin(origin)).toBe(expected);
  });
});

describe("allowlist", () => {
  it("lists the v1 sports capabilities and nothing adjacent", () => {
    expect(
      publicCapability("espn-com", "sports-data/scoreboard"),
    ).toBeDefined();
    expect(publicCapability("espn-com", "sports-data/event")).toBeDefined();
    expect(publicCapability("espn-com", "sports-data/standings")).toBeDefined();
    expect(
      publicCapability("nfl-com", "sports-league-data/injury_report"),
    ).toBeDefined();
    expect(
      publicCapability(
        "fantasyfootballcalculator-com",
        "fantasy-sports-rankings/adp",
      ),
    ).toBeDefined();
    expect(publicCapability("polymarket", "events/by-slug")).toBeDefined();
    expect(publicCapability("espn-com", "sports-data/search")).toBeUndefined();
    expect(publicCapability("polymarket", "search/query")).toBeUndefined();
    expect(
      publicCapability("nfl-com", "sports-league-data/news"),
    ).toBeUndefined();
    expect(
      publicCapability("draftsharks-com", "weekly_rankings"),
    ).toBeUndefined();
    expect(publicCapability("espn-com", "constructor")).toBeUndefined();
  });

  it("honours the global switch and the per-provider kill switch", () => {
    mocks.config.ALEXANDRIA_PUBLIC_RESULTS_DISABLED_PROVIDERS = ["espn-com"];
    expect(
      publicCapability("espn-com", "sports-data/scoreboard"),
    ).toBeUndefined();
    expect(publicCapability("polymarket", "events/by-slug")).toBeDefined();
    mocks.config.ALEXANDRIA_PUBLIC_RESULTS_ENABLED = false;
    expect(publicCapability("polymarket", "events/by-slug")).toBeUndefined();
  });
});

describe("filterPublicParams", () => {
  it("keeps only allowlisted options with the listed shape", () => {
    expect(
      filterPublicParams(
        { sport: "string", week: "number", stats: "string[]", flag: "boolean" },
        {
          sport: "football",
          week: "7",
          stats: ["wins", "losses"],
          flag: true,
          apiKey: "fc-secret",
          query: "anything",
        },
      ),
    ).toEqual({ sport: "football", stats: ["wins", "losses"], flag: true });
    expect(
      filterPublicParams(
        { sport: "string", stats: "string[]" },
        { sport: "x".repeat(201), stats: ["ok", 3] },
      ),
    ).toEqual({});
    expect(filterPublicParams({ sport: "string" }, undefined)).toEqual({});
  });
});

describe("sanitizePublicPayload", () => {
  it("strips internals, signed URLs and caller identifiers but keeps sports ids", () => {
    const clean = sanitizePublicPayload(
      {
        $schema: "https://gamma/schema",
        team_id: "25",
        negRiskRequestID: "0xabc",
        creditsCost: 3,
        request_id: "r",
        nested: {
          owner: team,
          headshot: "https://cdn.example.com/a.png?width=100",
          signed:
            "https://storage.googleapis.com/b/o.json?X-Goog-Signature=abc&X-Goog-Expires=60",
          s3: "https://s3.amazonaws.com/b/o?X-Amz-Signature=abc",
          list: [team, "keep", { cookie: "a=b", ok: 1 }],
        },
      },
      new Set([team]),
    );
    expect(clean).toEqual({
      team_id: "25",
      negRiskRequestID: "0xabc",
      nested: {
        headshot: "https://cdn.example.com/a.png?width=100",
        list: ["keep", { ok: 1 }],
      },
    });
  });
});

describe("buildPublicRecord", () => {
  it("builds the public record from an eligible item", () => {
    expect(build({})).toEqual({
      record: {
        jobId,
        provider: "espn-com",
        capability: "sports-data/scoreboard",
        createdVia: "chatgpt",
        fetchedAt: "2026-10-19T04:20:00.000Z",
        params: { sport: "football", league: "nfl", week: 7 },
        payload: {
          count: 1,
          events: [
            {
              event_id: "401873008",
              competitors: [
                { team_id: "25", logo: "https://a.espncdn.com/sf.png" },
              ],
            },
          ],
        },
      },
    });
  });

  it("skips items that are not allowlisted, need terms, failed, or are ambiguous", () => {
    expect(build({ unrestricted: new Set() })).toEqual({
      skipped: "not_eligible",
    });
    expect(
      build({
        results: [
          {
            provider: "espn-com",
            capability: "sports-data/scoreboard",
            error: { code: "x", message: "y" },
          },
        ],
      }),
    ).toEqual({ skipped: "not_eligible" });
    const search = {
      provider: "polymarket",
      capability: "search/query",
      options: { q: "chiefs" },
    };
    expect(
      build({
        calls: [search],
        results: [{ ...search, data: { events: [] } }],
        unrestricted: new Set(["polymarket/search/query"]),
      }),
    ).toEqual({ skipped: "not_eligible" });
    expect(
      build({
        calls: [scoreboard, scoreboard],
        results: [scoreboardItem, scoreboardItem],
      }),
    ).toEqual({ skipped: "ambiguous" });
    // A batch with one eligible item still gets a page for that item.
    const built = build({
      calls: [search, scoreboard],
      results: [{ ...search, data: {} }, scoreboardItem],
    });
    expect("record" in built && built.record.capability).toBe(
      "sports-data/scoreboard",
    );
  });

  it("requires the sports tag for Polymarket and caps the payload size", () => {
    const event = {
      provider: "polymarket",
      capability: "events/by-slug",
      options: { slug: "super-bowl-champion-2027" },
    };
    const unrestricted = new Set(["polymarket/events/by-slug"]);
    expect(
      build({
        calls: [event],
        results: [{ ...event, data: { tags: [{ slug: "politics" }] } }],
        unrestricted,
      }),
    ).toEqual({ skipped: "not_eligible" });
    const sports = build({
      calls: [event],
      results: [{ ...event, data: { tags: [{ slug: "sports" }] } }],
      unrestricted,
      origin: "mcp-claude-ai@1",
    });
    expect("record" in sports && sports.record.createdVia).toBe("claude");
    expect("record" in sports && sports.record.params).toEqual({
      slug: "super-bowl-champion-2027",
    });
    expect(
      build({
        results: [
          { ...scoreboardItem, data: { blob: "x".repeat(1024 * 1024) } },
        ],
      }),
    ).toEqual({ skipped: "too_large" });
  });
});

describe("storage", () => {
  it("writes under alexandria-public/ and never throws on failure", async () => {
    mocks.save.mockResolvedValue(undefined);
    await persistPublicResult({
      jobId,
      origin: "api",
      calls: [scoreboard],
      results: [scoreboardItem],
      unrestricted: new Set(["espn-com/sports-data/scoreboard"]),
      secrets: new Set(),
    });
    expect(mocks.file).toHaveBeenCalledWith(`alexandria-public/${jobId}.json`);
    const stored = JSON.parse(mocks.save.mock.calls[0][0]);
    expect(stored).toEqual(
      expect.objectContaining({ jobId, createdVia: "other" }),
    );
    expect(JSON.stringify(stored)).not.toMatch(/creditsCost|providerRequestId/);

    mocks.save.mockRejectedValue(new Error("gcs down"));
    await expect(
      persistPublicResult({
        jobId,
        origin: "api",
        calls: [scoreboard],
        results: [scoreboardItem],
        unrestricted: new Set(["espn-com/sports-data/scoreboard"]),
        secrets: new Set(),
      }),
    ).resolves.toBeUndefined();
  });

  it("reads a stored record and answers null when it is missing", async () => {
    mocks.download.mockResolvedValue([Buffer.from(JSON.stringify({ jobId }))]);
    expect(await loadPublicResult(jobId)).toEqual({ jobId });
    mocks.download.mockRejectedValue(
      Object.assign(new ApiError("No such object: x"), { code: 404 }),
    );
    expect(await loadPublicResult(jobId)).toBeNull();
    mocks.config.GCS_BUCKET_NAME = "";
    expect(await loadPublicResult(jobId)).toBeNull();
  });
});
