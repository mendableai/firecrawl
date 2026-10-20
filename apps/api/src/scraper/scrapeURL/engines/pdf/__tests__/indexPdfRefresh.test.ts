vi.mock("../../../../../services", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../../../services")>()),
  useIndex: true,
}));

import { config } from "../../../../../config";
import { shouldUseIndex } from "../../index";

type MutableConfig = {
  FIRECRAWL_INDEX_WRITE_ONLY?: boolean;
  INDEX_SKIP_ON_PDF_REFRESH: boolean;
};

function metaWith(parsers: unknown) {
  return {
    internalOptions: { isParse: false },
    featureFlags: new Set(),
    options: {
      formats: ["markdown"],
      maxAge: 60_000,
      storeInCache: true,
      parsers,
    },
  } as any;
}

describe("URL index and PDF refresh", () => {
  const mutable = config as unknown as MutableConfig;
  let originalWriteOnly: boolean | undefined;
  let originalSkip: boolean;

  beforeEach(() => {
    originalWriteOnly = mutable.FIRECRAWL_INDEX_WRITE_ONLY;
    originalSkip = mutable.INDEX_SKIP_ON_PDF_REFRESH;
    mutable.FIRECRAWL_INDEX_WRITE_ONLY = false;
  });

  afterEach(() => {
    mutable.FIRECRAWL_INDEX_WRITE_ONLY = originalWriteOnly;
    mutable.INDEX_SKIP_ON_PDF_REFRESH = originalSkip;
  });

  it("keeps reading the index for a refresh while the flag is off", () => {
    mutable.INDEX_SKIP_ON_PDF_REFRESH = false;
    expect(shouldUseIndex(metaWith([{ type: "pdf", refresh: true }]))).toBe(
      true,
    );
  });

  it("skips the index for a refresh when the flag is on", () => {
    mutable.INDEX_SKIP_ON_PDF_REFRESH = true;
    expect(shouldUseIndex(metaWith([{ type: "pdf", refresh: true }]))).toBe(
      false,
    );
  });

  it.each([
    ["no parsers", undefined],
    ["pdf parser without refresh", [{ type: "pdf" }]],
    ["refresh false", [{ type: "pdf", refresh: false }]],
  ])("keeps reading the index with the flag on for %s", (_name, parsers) => {
    mutable.INDEX_SKIP_ON_PDF_REFRESH = true;
    expect(shouldUseIndex(metaWith(parsers))).toBe(true);
  });
});
