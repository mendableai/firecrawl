import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  completeTruncatedHandoff,
  declaredContentLength,
  isTruncatedPdf,
} from "../truncatedHandoff";

const FULL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n" +
    "trailer\n<< /Root 1 0 R >>\n%%EOF\n",
);
const CUT_PDF = FULL_PDF.subarray(0, 40);
const HTML = Buffer.from("<!doctype html><html><body>blocked</body></html>");

const tempFiles: string[] = [];

async function tempFile(bytes: Buffer): Promise<string> {
  const filePath = path.join(tmpdir(), `truncated-handoff-${randomUUID()}`);
  await writeFile(filePath, bytes);
  tempFiles.push(filePath);
  return filePath;
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false,
  );
}

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map(f => unlink(f).catch(() => {})));
});

function makeMeta() {
  const logger: any = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  logger.child = vi.fn(() => logger);
  return {
    id: "scrape-truncated-handoff",
    url: "https://example.com/report.pdf",
    logger,
    options: { skipTlsVerification: false, headers: undefined },
    abort: {
      asSignal: () => new AbortController().signal,
      throwIfAborted: vi.fn(),
    },
  } as any;
}

async function handoffOf(bytes: Buffer, contentLength?: number): Promise<any> {
  return {
    filePath: await tempFile(bytes),
    url: "https://example.com/report.pdf",
    status: 200,
    proxyUsed: "stealth",
    contentType: "application/pdf",
    handoff: { contentLength },
  };
}

/** A direct download that yields `bytes` with the given status and headers. */
function downloadReturning(
  bytes: Buffer,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return vi.fn(async (..._args: any[]) => ({
    tempFilePath: await tempFile(bytes),
    response: new Response(null, {
      status: init.status ?? 200,
      headers: init.headers,
    }) as any,
  }));
}

describe("declaredContentLength", () => {
  it("reads an unencoded Content-Length, case-insensitively", () => {
    expect(declaredContentLength({ "Content-Length": "2048" })).toBe(2048);
    expect(
      declaredContentLength({
        "content-length": "10",
        "content-encoding": "identity",
      }),
    ).toBe(10);
  });

  it("ignores a length that counts an encoded stream, or is missing or malformed", () => {
    expect(
      declaredContentLength({
        "content-length": "10",
        "content-encoding": "br",
      }),
    ).toBeUndefined();
    expect(declaredContentLength({ "content-length": "ten" })).toBeUndefined();
    expect(declaredContentLength({ "content-length": "0" })).toBeUndefined();
    expect(declaredContentLength({})).toBeUndefined();
    expect(declaredContentLength(undefined)).toBeUndefined();
  });
});

describe("isTruncatedPdf", () => {
  it("accepts a PDF that ends with its end-of-file marker", async () => {
    expect(await isTruncatedPdf(await tempFile(FULL_PDF))).toBe(false);
    expect(
      await isTruncatedPdf(await tempFile(FULL_PDF), FULL_PDF.length),
    ).toBe(false);
  });

  it("accepts trailing bytes after the end-of-file marker", async () => {
    const padded = Buffer.concat([FULL_PDF, Buffer.alloc(512, 0x20)]);
    expect(await isTruncatedPdf(await tempFile(padded))).toBe(false);
  });

  it("flags a PDF cut off before its end-of-file marker", async () => {
    expect(await isTruncatedPdf(await tempFile(CUT_PDF))).toBe(true);
  });

  it("flags fewer bytes than the response declared, even with a marker", async () => {
    expect(
      await isTruncatedPdf(await tempFile(FULL_PDF), FULL_PDF.length + 1),
    ).toBe(true);
  });
});

describe("completeTruncatedHandoff", () => {
  it("replaces a cut-off handoff with a complete direct download", async () => {
    const meta = makeMeta();
    const handoff = await handoffOf(CUT_PDF, FULL_PDF.length);
    const download = downloadReturning(FULL_PDF, {
      headers: { "content-length": String(FULL_PDF.length) },
    });

    const result = await completeTruncatedHandoff(
      meta,
      handoff,
      1024,
      download,
    );

    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][1]).toBe("https://example.com/report.pdf");
    expect(download.mock.calls[0][4]).toBe(1024);
    expect(await readFile(result.filePath)).toEqual(FULL_PDF);
    expect(result.proxyUsed).toBe("basic");
    expect(result.handoff).toBeUndefined();
    expect(await exists(handoff.filePath)).toBe(false);
    expect(meta.logger.warn).toHaveBeenCalledWith(
      "PDF handoff looks truncated",
      expect.objectContaining({
        event: "pdf_handoff_truncated",
        outcome: "recovered",
        handoff_bytes: CUT_PDF.length,
        refetched_bytes: FULL_PDF.length,
      }),
    );
  });

  it("refetches when the handoff is shorter than its declared length", async () => {
    const handoff = await handoffOf(FULL_PDF, FULL_PDF.length * 2);
    const longer = Buffer.concat([FULL_PDF, FULL_PDF]);
    const download = downloadReturning(longer);

    const result = await completeTruncatedHandoff(
      makeMeta(),
      handoff,
      1024,
      download,
    );

    expect(await readFile(result.filePath)).toEqual(longer);
  });

  it("leaves a complete handoff alone", async () => {
    const handoff = await handoffOf(FULL_PDF, FULL_PDF.length);
    const download = downloadReturning(FULL_PDF);

    const result = await completeTruncatedHandoff(
      makeMeta(),
      handoff,
      1024,
      download,
    );

    expect(result).toBe(handoff);
    expect(download).not.toHaveBeenCalled();
  });

  it("never refetches files that did not come from a browser handoff", async () => {
    const upload = { ...(await handoffOf(CUT_PDF)), handoff: undefined };
    const byReference = {
      ...(await handoffOf(CUT_PDF)),
      gcsReference: { uri: "gs://bucket/key.pdf" },
    };
    const download = downloadReturning(FULL_PDF);

    expect(
      await completeTruncatedHandoff(makeMeta(), upload, 1024, download),
    ).toBe(upload);
    expect(
      await completeTruncatedHandoff(makeMeta(), byReference, 1024, download),
    ).toBe(byReference);
    expect(download).not.toHaveBeenCalled();
  });

  it("does not refetch a handoff that is not a PDF", async () => {
    const handoff = await handoffOf(HTML);
    const download = downloadReturning(FULL_PDF);

    expect(
      await completeTruncatedHandoff(makeMeta(), handoff, 1024, download),
    ).toBe(handoff);
    expect(download).not.toHaveBeenCalled();
  });

  it("keeps the handoff when the direct download fails", async () => {
    const meta = makeMeta();
    const handoff = await handoffOf(CUT_PDF);
    const download = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const result = await completeTruncatedHandoff(
      meta,
      handoff,
      1024,
      download as any,
    );

    expect(result).toBe(handoff);
    expect(await readFile(handoff.filePath)).toEqual(CUT_PDF);
    expect(meta.logger.warn).toHaveBeenCalledWith(
      "PDF handoff looks truncated",
      expect.objectContaining({ outcome: "refetch_failed" }),
    );
  });

  it.each([
    ["an error status", FULL_PDF, 403, "refetch_bad_status"],
    ["a page that is not a PDF", HTML, 200, "refetch_not_pdf"],
    ["a copy no longer than the handoff", CUT_PDF, 200, "refetch_incomplete"],
  ])(
    "keeps the handoff when the direct download returns %s",
    async (_label, bytes, status, outcome) => {
      const meta = makeMeta();
      const handoff = await handoffOf(CUT_PDF);
      const download = downloadReturning(bytes, { status });

      const result = await completeTruncatedHandoff(
        meta,
        handoff,
        1024,
        download,
      );

      expect(result).toBe(handoff);
      expect(await readFile(handoff.filePath)).toEqual(CUT_PDF);
      const refetchedPath = (await download.mock.results[0].value).tempFilePath;
      expect(await exists(refetchedPath)).toBe(false);
      expect(meta.logger.warn).toHaveBeenCalledWith(
        "PDF handoff looks truncated",
        expect.objectContaining({ outcome }),
      );
    },
  );
});
