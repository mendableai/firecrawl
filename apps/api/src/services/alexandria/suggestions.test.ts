const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  config: { FIRE_EXCHANGE_URL: "https://exchange.test" as string | undefined },
}));
vi.mock("./client", () => ({ exchangeRequest: mocks.request }));
vi.mock("../../config", () => ({ config: mocks.config }));
import { exchangeUrlSuggestions } from "./suggestions";

const url = "https://data.similarweb.com/api/v1/data?domain=example.com";
const suggestion = {
  provider: "similarweb",
  name: "Similarweb",
  capability: "web/traffic",
  label: "Traffic and engagement",
  relationship: "related",
  group: "alternative",
  input: { domain: "example.com" },
  contractPath: "/v1/discover/web-analytics/similarweb",
};

describe("exchangeUrlSuggestions", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.config.FIRE_EXCHANGE_URL = "https://exchange.test";
  });

  it("asks the Exchange about one URL and rewrites contract paths to the public proxy", async () => {
    mocks.request.mockResolvedValue({
      status: 200,
      body: { url, suggestions: [suggestion], message: "Structured data…" },
    });
    const result = await exchangeUrlSuggestions({ teamId: "team", url });
    expect(mocks.request).toHaveBeenCalledWith({
      teamId: "team",
      path: `/v1/discover/suggestions?url=${encodeURIComponent(url)}`,
      timeoutMs: 1500,
    });
    expect(result).toEqual({
      suggestions: [
        {
          ...suggestion,
          contractPath: "/exchange/discover/web-analytics/similarweb",
        },
      ],
      message: "Structured data…",
    });
  });

  it("fails open", async () => {
    for (const outcome of [
      { status: 500, body: { error: "x" } },
      { status: 200, body: { url, suggestions: [] } },
      { status: 200, body: "not json" },
    ]) {
      mocks.request.mockResolvedValueOnce(outcome);
      expect(
        await exchangeUrlSuggestions({ teamId: "t", url }),
      ).toBeUndefined();
    }
    mocks.request.mockRejectedValueOnce(new Error("timeout"));
    expect(await exchangeUrlSuggestions({ teamId: "t", url })).toBeUndefined();
    mocks.config.FIRE_EXCHANGE_URL = undefined;
    expect(await exchangeUrlSuggestions({ teamId: "t", url })).toBeUndefined();
    expect(mocks.request).toHaveBeenCalledTimes(4);
  });
});
