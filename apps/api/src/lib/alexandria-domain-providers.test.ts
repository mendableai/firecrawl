import { config } from "../config";
import { exchangeRequest } from "../services/alexandria/client";
import {
  alexandriaDomainLookupsTotal,
  clearDomainProviderCache,
  domainProvidersWithin,
  lookupDomainProviders,
} from "./alexandria-domain-providers";
import { computeAgentHintSignals } from "./agent-hint-signals";

vi.mock("../services/alexandria/client", () => ({
  exchangeRequest: vi.fn(),
}));

const exchange = vi.mocked(exchangeRequest);

function resolves(ids: string[], delayMs = 0) {
  exchange.mockImplementation(
    () =>
      new Promise(resolve =>
        setTimeout(
          () =>
            resolve({
              status: 200,
              body: {
                skills: ids.map(id => ({ id, matchedDomains: ["example"] })),
              },
            }),
          delayMs,
        ),
      ),
  );
}

async function count(outcome: string): Promise<number> {
  const metric = await alexandriaDomainLookupsTotal.get();
  return metric.values.find(v => v.labels.outcome === outcome)?.value ?? 0;
}

describe("Alexandria domain providers for agent hints", () => {
  const originalUrl = config.FIRE_EXCHANGE_URL;

  beforeEach(() => {
    config.FIRE_EXCHANGE_URL = "http://exchange.test";
    clearDomainProviderCache();
    exchange.mockReset();
  });

  afterAll(() => {
    config.FIRE_EXCHANGE_URL = originalUrl;
  });

  it("resolves the host only and serves later requests from the cache", async () => {
    resolves(["finance-yahoo-com"]);
    const first = lookupDomainProviders(
      "https://Finance.Yahoo.com/quote/AAPL/?p=AAPL",
      "team-1",
    );
    expect(await domainProvidersWithin(first!, 100)).toEqual([
      "finance-yahoo-com",
    ]);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange.mock.calls[0][0]).toMatchObject({
      path: "/v1/skills/resolve",
      body: { urls: ["https://finance.yahoo.com/"] },
    });

    const hits = await count("cache_hit");
    const second = lookupDomainProviders(
      "https://finance.yahoo.com/quote/MSFT/",
      "team-2",
    );
    expect(await domainProvidersWithin(second!, 0)).toEqual([
      "finance-yahoo-com",
    ]);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(await count("cache_hit")).toBe(hits + 1);
  });

  it("skips a late lookup but caches its result for the next request", async () => {
    resolves(["github-com"], 150);
    const late = await count("late");
    const lookup = lookupDomainProviders(
      "https://github.com/firecrawl/firecrawl",
      "team-1",
    );
    expect(await domainProvidersWithin(lookup!, 20)).toBeUndefined();
    expect(await count("late")).toBe(late + 1);

    const concurrent = lookupDomainProviders(
      "https://github.com/other/repo",
      "team-1",
    );
    expect(concurrent).toBe(lookup);

    await lookup;
    const next = lookupDomainProviders("https://github.com/a/b", "team-1");
    expect(await domainProvidersWithin(next!, 0)).toEqual(["github-com"]);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("reports a failed lookup as unknown, not as no providers, and backs off", async () => {
    exchange.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const errors = await count("error");
    const lookup = lookupDomainProviders("https://example.com/", "team-1");
    expect(await domainProvidersWithin(lookup!, 100)).toBeUndefined();
    expect(await count("error")).toBe(errors + 1);

    exchange.mockResolvedValue({ status: 503, body: "unavailable" });
    const other = lookupDomainProviders("https://example.org/", "team-1");
    expect(await domainProvidersWithin(other!, 100)).toBeUndefined();

    const late = await count("late");
    const again = lookupDomainProviders("https://example.com/x", "team-1");
    expect(await domainProvidersWithin(again!, 0)).toBeUndefined();
    expect(await count("late")).toBe(late);
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it("caches a host with no matching provider", async () => {
    resolves([]);
    const lookup = lookupDomainProviders(
      "https://www.paulgraham.com/greatwork.html",
      "team-1",
    );
    expect(await domainProvidersWithin(lookup!, 100)).toEqual([]);
    const again = lookupDomainProviders(
      "https://www.paulgraham.com/hwh.html",
      "team-1",
    );
    expect(await domainProvidersWithin(again!, 0)).toEqual([]);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("drops provider ids that are not plain identifiers", async () => {
    resolves(["wikipedia", "bad id\nwith text", "wikipedia"]);
    const lookup = lookupDomainProviders(
      "https://en.wikipedia.org/wiki/X",
      "team-1",
    );
    expect(await domainProvidersWithin(lookup!, 100)).toEqual(["wikipedia"]);
  });

  it("does nothing without an Exchange or a usable URL", () => {
    expect(
      lookupDomainProviders("https://user:pass@example.com/", "team-1"),
    ).toBeUndefined();
    expect(lookupDomainProviders("ftp://example.com/", "team-1")).toBe(
      undefined,
    );
    expect(lookupDomainProviders(undefined, "team-1")).toBeUndefined();
    config.FIRE_EXCHANGE_URL = undefined;
    expect(
      lookupDomainProviders("https://example.com/", "team-1"),
    ).toBeUndefined();
    expect(exchange).not.toHaveBeenCalled();
  });

  it("exposes providers as hint signals only when the lookup finished", () => {
    const response = { success: true, data: { metadata: {} } };
    const matched = computeAgentHintSignals({
      endpoint: "scrape",
      response,
      domainProviders: ["finance-yahoo-com", "sec-gov"],
    });
    expect(matched.get("alexandria_provider_count")).toBe(2);
    expect(matched.get("alexandria_provider")).toBe("finance-yahoo-com");
    expect(matched.get("alexandria_providers")).toEqual([
      "finance-yahoo-com",
      "sec-gov",
    ]);

    const unmatched = computeAgentHintSignals({
      endpoint: "scrape",
      response,
      domainProviders: [],
    });
    expect(unmatched.get("alexandria_provider_count")).toBe(0);
    expect(unmatched.has("alexandria_provider")).toBe(false);

    const skipped = computeAgentHintSignals({ endpoint: "scrape", response });
    expect(skipped.has("alexandria_provider_count")).toBe(false);
  });
});
