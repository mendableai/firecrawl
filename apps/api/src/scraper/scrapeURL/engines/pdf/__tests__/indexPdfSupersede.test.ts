vi.mock("../../../../../services", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../../../services")>()),
  getIndexFromGCS: vi.fn(),
}));
vi.mock("../../../../../db/rpc", () => ({
  queryMaxAge: vi.fn(),
  indexGetRecent5: vi.fn(),
}));
vi.mock("../fire-pdf/cache-service", () => ({
  cacheServiceConfigured: vi.fn(() => true),
  checkFirePdfSupersedes: vi.fn(),
}));

import { getIndexFromGCS } from "../../../../../services";
import { indexGetRecent5 } from "../../../../../db/rpc";
import { checkFirePdfSupersedes } from "../fire-pdf/cache-service";
import { scrapeURLWithIndex } from "../../index/index";
import { IndexMissError } from "../../../error";
import { config } from "../../../../../config";

type MutableConfig = { INDEX_PDF_SUPERSEDE_CHECK: boolean };
const mutable = config as unknown as MutableConfig;

const createdAt = "2026-10-01T00:00:00.000Z";
const rawKey = `raw-${"b".repeat(64)}`;

function meta() {
  return {
    id: "index-supersede",
    url: "https://example.com/doc.pdf",
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    },
    internalOptions: { teamId: "team-1" },
    featureFlags: new Set(),
    options: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      mobile: false,
      blockAds: true,
      waitFor: 0,
      formats: ["markdown"],
    },
    imageOcrEnabled: async () => false,
  } as any;
}

function indexedPdf(extra: Record<string, unknown> = {}) {
  return {
    url: "https://example.com/doc.pdf",
    html: "<p>old parse</p>",
    statusCode: 200,
    contentType: "application/pdf",
    pdfMetadata: { numPages: 2 },
    ...extra,
  };
}

describe("URL index PDF supersede check", () => {
  let original: boolean;

  beforeEach(() => {
    original = mutable.INDEX_PDF_SUPERSEDE_CHECK;
    vi.mocked(indexGetRecent5).mockResolvedValue([
      {
        id: "row-1",
        created_at: createdAt,
        status: 200,
        has_screenshot: false,
        has_screenshot_fullscreen: false,
        wait_time_ms: null,
      },
    ] as any);
    vi.mocked(checkFirePdfSupersedes).mockReset();
  });

  afterEach(() => {
    mutable.INDEX_PDF_SUPERSEDE_CHECK = original;
  });

  it("serves the index copy without asking while the flag is off", async () => {
    mutable.INDEX_PDF_SUPERSEDE_CHECK = false;
    vi.mocked(getIndexFromGCS).mockResolvedValue(
      indexedPdf({ firePdfCacheKey: rawKey }),
    );
    const result = await scrapeURLWithIndex(meta());
    expect(result.html).toBe("<p>old parse</p>");
    expect(checkFirePdfSupersedes).not.toHaveBeenCalled();
  });

  it("misses when fire-pdf holds a newer entry", async () => {
    mutable.INDEX_PDF_SUPERSEDE_CHECK = true;
    vi.mocked(getIndexFromGCS).mockResolvedValue(
      indexedPdf({ firePdfCacheKey: rawKey }),
    );
    vi.mocked(checkFirePdfSupersedes).mockResolvedValue("superseded");
    await expect(scrapeURLWithIndex(meta())).rejects.toBeInstanceOf(
      IndexMissError,
    );
    expect(checkFirePdfSupersedes).toHaveBeenCalledWith(
      expect.anything(),
      rawKey,
      new Date(createdAt),
    );
  });

  it.each(["current", "error"] as const)(
    "serves the index copy when the check says %s",
    async result => {
      mutable.INDEX_PDF_SUPERSEDE_CHECK = true;
      vi.mocked(getIndexFromGCS).mockResolvedValue(
        indexedPdf({ firePdfCacheKey: rawKey }),
      );
      vi.mocked(checkFirePdfSupersedes).mockResolvedValue(result);
      const served = await scrapeURLWithIndex(meta());
      expect(served.html).toBe("<p>old parse</p>");
    },
  );

  it("does not ask for entries indexed without a content key", async () => {
    mutable.INDEX_PDF_SUPERSEDE_CHECK = true;
    vi.mocked(getIndexFromGCS).mockResolvedValue(indexedPdf());
    const served = await scrapeURLWithIndex(meta());
    expect(served.html).toBe("<p>old parse</p>");
    expect(checkFirePdfSupersedes).not.toHaveBeenCalled();
  });
});
