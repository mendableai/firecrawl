const mocks = vi.hoisted(() => ({
  rows: [] as { billing_address: unknown }[],
  query: vi.fn(),
  getValue: vi.fn(),
  setValue: vi.fn(),
}));

vi.mock("../db/connection", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "from", "innerJoin", "where"])
    chain[name] = () => chain;
  chain.orderBy = async () => {
    mocks.query();
    return mocks.rows;
  };
  return { dbRr: chain };
});
vi.mock("../services/redis", () => ({
  getValue: mocks.getValue,
  setValue: mocks.setValue,
}));

import { billingCountryForTeam } from "./billing-country";

describe("billingCountryForTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getValue.mockResolvedValue(null);
    mocks.setValue.mockResolvedValue(undefined);
    mocks.rows = [];
  });

  it("takes the first member with a valid country and caches it", async () => {
    mocks.rows = [
      { billing_address: null },
      { billing_address: { country: "xx1" } },
      { billing_address: { country: " de " } },
      { billing_address: { country: "FR" } },
    ];
    await expect(billingCountryForTeam("team")).resolves.toBe("DE");
    expect(mocks.setValue).toHaveBeenCalledWith(
      "billing-country:team",
      "DE",
      3600,
    );
  });

  it("caches a team with no billing country so it is not queried again", async () => {
    await expect(billingCountryForTeam("team")).resolves.toBeUndefined();
    expect(mocks.setValue).toHaveBeenCalledWith(
      "billing-country:team",
      "",
      3600,
    );
    mocks.getValue.mockResolvedValue("");
    await expect(billingCountryForTeam("team")).resolves.toBeUndefined();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("serves a cached country without querying", async () => {
    mocks.getValue.mockResolvedValue("US");
    await expect(billingCountryForTeam("team")).resolves.toBe("US");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("reads any failure as unknown", async () => {
    mocks.getValue.mockRejectedValue(new Error("redis down"));
    await expect(billingCountryForTeam("team")).resolves.toBeUndefined();
  });
});
