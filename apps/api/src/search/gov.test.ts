vi.mock("undici", () => ({
  Agent: class {},
  fetch: vi.fn(),
}));

vi.mock("../config", () => ({
  config: { SEARCH_PLATFORM_URL: "https://platform.test/" },
}));

import { fetch } from "undici";
import { searchGovCategory } from "./gov";

const fetchMock = vi.mocked(fetch);

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as any;

function upstreamOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as any;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("searchGovCategory", () => {
  it("sends the query, the result count and the team", async () => {
    fetchMock.mockResolvedValue(
      upstreamOk({ success: true, data: { web: [] } }),
    );

    await searchGovCategory(
      {
        query: "food labeling rules",
        limit: 7,
        teamId: "t1",
        timeout: 500,
        zeroDataRetention: false,
      },
      logger,
    );

    const [url, init] = fetchMock.mock.calls[0] as any[];
    expect(url).toBe("https://platform.test/api/v1/gov-search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      query: "food labeling rules",
      top_k: 7,
    });
    expect(init.headers["firecrawl-team-id"]).toBe("t1");
    expect(init.headers["firecrawl-zero-data-retention"]).toBe("false");
  });

  it("tells the upstream that a zero data retention search must not be kept", async () => {
    fetchMock.mockResolvedValue(
      upstreamOk({ success: true, data: { web: [] } }),
    );

    await searchGovCategory(
      {
        query: "private query",
        limit: 3,
        teamId: "t1",
        timeout: 500,
        zeroDataRetention: true,
      },
      logger,
    );

    const [, init] = fetchMock.mock.calls[0] as any[];
    expect(init.headers["firecrawl-zero-data-retention"]).toBe("true");
  });

  it("maps results to the exact web schema and tags the category", async () => {
    fetchMock.mockResolvedValue(
      upstreamOk({
        success: true,
        data: {
          web: [
            {
              url: "https://www.ecfr.gov/current/title-21/part-101",
              title: "21 CFR Part 101",
              description: "Food labeling",
              position: 42,
              score: 0.9,
            },
            { url: "", title: "dropped", description: "", position: 43 },
            {
              url: "https://www.ecfr.gov/current/title-21/part-102",
              title: "  ",
              position: 44,
            },
          ],
        },
      }),
    );

    const results = await searchGovCategory(
      {
        query: "food labeling",
        limit: 5,
        teamId: "t1",
        timeout: 500,
        zeroDataRetention: false,
      },
      logger,
    );

    expect(results).toStrictEqual([
      {
        url: "https://www.ecfr.gov/current/title-21/part-101",
        title: "21 CFR Part 101",
        description: "Food labeling",
        position: 1,
        category: "gov",
      },
      {
        url: "https://www.ecfr.gov/current/title-21/part-102",
        title: "https://www.ecfr.gov/current/title-21/part-102",
        description: "",
        position: 3,
        category: "gov",
      },
    ]);
  });

  it("passes through the index's legal labels and drops malformed ones", async () => {
    fetchMock.mockResolvedValue(
      upstreamOk({
        success: true,
        data: {
          web: [
            {
              url: "https://www.courtlistener.com/opinion/1/",
              title: "Oliver v. Greene",
              description: "Qualified immunity",
              position: 1,
              updated_at: 1700000000000,
              jurisdiction: "us",
              court: "ca6",
              court_type: "federal-appellate",
              cites: ["us:usc:42:1983", 7, ""],
              cited_as: ["us:f3d:779:401"],
            },
            {
              url: "https://www.ecfr.gov/current/title-21/part-101",
              title: "21 CFR Part 101",
              description: "Food labeling",
              position: 2,
              updated_at: 1700000000000.5,
              jurisdiction: "",
              court: null,
              cites: [],
              cited_as: "us:cfr:21:101",
            },
          ],
        },
      }),
    );

    const results = await searchGovCategory(
      {
        query: "excessive force",
        limit: 5,
        teamId: "t1",
        timeout: 500,
        zeroDataRetention: false,
      },
      logger,
    );

    expect(results).toStrictEqual([
      {
        url: "https://www.courtlistener.com/opinion/1/",
        title: "Oliver v. Greene",
        description: "Qualified immunity",
        position: 1,
        category: "gov",
        jurisdiction: "us",
        court: "ca6",
        court_type: "federal-appellate",
        cites: ["us:usc:42:1983"],
        cited_as: ["us:f3d:779:401"],
        updated_at: 1700000000000,
      },
      {
        url: "https://www.ecfr.gov/current/title-21/part-101",
        title: "21 CFR Part 101",
        description: "Food labeling",
        position: 2,
        category: "gov",
      },
    ]);
  });

  it("returns no results and drains the body when the upstream fails", async () => {
    const cancel = vi.fn(async () => {});
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      body: { cancel },
    } as any);

    await expect(
      searchGovCategory(
        {
          query: "zoning",
          limit: 5,
          teamId: "t1",
          timeout: 500,
          zeroDataRetention: false,
        },
        logger,
      ),
    ).resolves.toEqual([]);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("returns no results when the upstream throws", async () => {
    fetchMock.mockRejectedValue(new Error("connection reset"));

    await expect(
      searchGovCategory(
        {
          query: "zoning",
          limit: 5,
          teamId: "t1",
          timeout: 500,
          zeroDataRetention: false,
        },
        logger,
      ),
    ).resolves.toEqual([]);
  });
});
