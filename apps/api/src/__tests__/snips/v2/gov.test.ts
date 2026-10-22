import { config } from "../../../config";
import { describeIf } from "../lib";
import { idmux, researchRaw, scrapeTimeout, search } from "./lib";

const HAS_GOV =
  !!config.SEARCH_PLATFORM_URL && !process.env.TEST_SUITE_SELF_HOSTED;

function expectLegalLabelShape(result: any) {
  for (const key of ["jurisdiction", "court", "court_type"]) {
    if (result[key] !== undefined) expect(typeof result[key]).toBe("string");
  }
  for (const key of ["cites", "cited_as"]) {
    if (result[key] !== undefined) {
      expect(Array.isArray(result[key])).toBe(true);
      for (const id of result[key]) expect(typeof id).toBe("string");
    }
  }
  if (result.updated_at !== undefined) {
    expect(typeof result.updated_at).toBe("number");
  }
}
const PATH = "/v2/search/gov";

describeIf(HAS_GOV)("Government Index Search API", () => {
  it("serves a search as web results", async () => {
    const identity = await idmux({
      name: "gov/get",
      credits: 100,
    });

    const res = await researchRaw(
      PATH,
      { query: "food labeling requirements", k: 3 },
      identity,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.web)).toBe(true);
    expect(res.body.data.web.length).toBeGreaterThan(0);
    expect(res.body.data.web.length).toBeLessThanOrEqual(3);
    for (const result of res.body.data.web) {
      expect(typeof result.url).toBe("string");
      expect(typeof result.title).toBe("string");
      expect(typeof result.description).toBe("string");
      expect(typeof result.position).toBe("number");
    }
  }, 120000);

  it(
    "filters on the legal labels and returns them on each result",
    async () => {
      const identity = await idmux({ name: "gov/labels", credits: 100 });

      const res = await researchRaw(
        PATH,
        {
          query: "qualified immunity excessive force",
          k: 5,
          jurisdiction: "us",
          courtType: "federal-appellate",
          cites: "42 U.S.C. § 1983",
        },
        identity,
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      for (const result of res.body.data.web) {
        expectLegalLabelShape(result);
        if (result.jurisdiction !== undefined) {
          expect(result.jurisdiction).toBe("us");
        }
        if (result.court_type !== undefined) {
          expect(result.court_type).toBe("federal-appellate");
        }
      }
    },
    scrapeTimeout,
  );

  it(
    "refuses a court type outside the list",
    async () => {
      const identity = await idmux({
        name: "gov/bad-court-type",
        credits: 100,
      });

      const res = await researchRaw(
        PATH,
        { query: "zoning", courtType: "county-fair" },
        identity,
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    },
    scrapeTimeout,
  );

  it(
    "returns the legal labels on categories gov results from /v2/search",
    async () => {
      const identity = await idmux({
        name: "gov/category-labels",
        credits: 100,
      });

      const data = await search(
        {
          query: "qualified immunity excessive force",
          categories: ["gov"],
          limit: 5,
        },
        identity,
      );

      expect(Array.isArray(data.web)).toBe(true);
      for (const result of data.web ?? []) {
        expect((result as any).category).toBe("gov");
        expectLegalLabelShape(result);
      }
    },
    scrapeTimeout,
  );
});
