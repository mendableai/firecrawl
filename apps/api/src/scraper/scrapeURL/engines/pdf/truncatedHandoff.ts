import { open, unlink } from "node:fs/promises";
import type { Meta } from "../..";
import { AbortManagerThrownError } from "../../lib/abortManager";
import { downloadFile } from "../utils/downloadFile";
import { isPdfBuffer, PDF_SNIFF_WINDOW } from "./pdfUtils";

type PdfPrefetch = NonNullable<Meta["pdfPrefetch"]>;

// The PDF spec puts the end-of-file marker in the last 1024 bytes; real
// files sometimes carry trailing junk after it, so look a little further.
const EOF_SEARCH_BYTES = 4096;

/**
 * The body length a response declared, when it describes the bytes as
 * delivered: a Content-Length under a content encoding counts the encoded
 * stream, not the decoded file.
 */
export function declaredContentLength(
  headers: Record<string, string> | undefined,
): number | undefined {
  if (!headers) return undefined;
  const header = (name: string) =>
    Object.entries(headers).find(([k]) => k.toLowerCase() === name)?.[1];
  const encoding = header("content-encoding")?.trim().toLowerCase();
  if (encoding && encoding !== "identity") return undefined;
  const raw = header("content-length")?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const length = Number(raw);
  return Number.isSafeInteger(length) && length > 0 ? length : undefined;
}

/**
 * Whether a downloaded PDF stops short of its end: fewer bytes than the
 * response declared, or a file that does not end with an end-of-file marker.
 * Only whitespace may follow the last marker: an incremental update cut off
 * partway leaves the previous revision's marker in the tail, followed by the
 * new revision's partial objects.
 */
export async function isTruncatedPdf(
  filePath: string,
  contentLength?: number,
): Promise<boolean> {
  const fh = await open(filePath, "r");
  try {
    const { size } = await fh.stat();
    if (contentLength !== undefined && size < contentLength) return true;
    const length = Math.min(size, EOF_SEARCH_BYTES);
    const tail = Buffer.alloc(length);
    await fh.read(tail, 0, length, size - length);
    const marker = tail.lastIndexOf("%%EOF");
    if (marker === -1) return true;
    return !/^[\s\0]*$/.test(tail.subarray(marker + 5).toString("latin1"));
  } finally {
    await fh.close();
  }
}

async function readHead(filePath: string): Promise<Buffer> {
  const fh = await open(filePath, "r");
  try {
    const head = Buffer.alloc(PDF_SNIFF_WINDOW);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function fileSize(filePath: string): Promise<number> {
  const fh = await open(filePath, "r");
  try {
    return (await fh.stat()).size;
  } finally {
    await fh.close();
  }
}

async function removeQuietly(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => {});
}

/**
 * A browser handoff can deliver only the first part of a PDF: the capture
 * ends when the response stream does, even when the connection closed
 * before the whole body arrived. Parsing such a prefix finds no pages, or
 * silently loses every page past the cut. When the handoff looks cut off,
 * download the file again directly and use that copy if it is a complete
 * PDF (or at least a longer one). Any failure keeps the handoff as it was.
 */
export async function completeTruncatedHandoff(
  meta: Meta,
  prefetch: PdfPrefetch,
  maxSize: number,
  download: typeof downloadFile = downloadFile,
): Promise<PdfPrefetch> {
  if (!prefetch.handoff || prefetch.gcsReference) return prefetch;
  const { contentLength } = prefetch.handoff;
  if (
    !isPdfBuffer(await readHead(prefetch.filePath)) ||
    !(await isTruncatedPdf(prefetch.filePath, contentLength))
  ) {
    return prefetch;
  }

  const handoffBytes = await fileSize(prefetch.filePath);
  const logger = meta.logger.child({
    method: "scrapePDF/completeTruncatedHandoff",
  });
  const report = (outcome: string, extra: Record<string, unknown> = {}) =>
    logger.warn("PDF handoff looks truncated", {
      event: "pdf_handoff_truncated",
      outcome,
      handoff_bytes: handoffBytes,
      declared_bytes: contentLength,
      scrape_id: meta.id,
      ...extra,
    });

  let refetched: Awaited<ReturnType<typeof downloadFile>>;
  try {
    refetched = await download(
      meta.id,
      prefetch.url ?? meta.rewrittenUrl ?? meta.url,
      meta.options.skipTlsVerification,
      { headers: meta.options.headers, signal: meta.abort.asSignal() },
      maxSize,
    );
  } catch (error) {
    if (error instanceof AbortManagerThrownError) throw error;
    meta.abort.throwIfAborted();
    report("refetch_failed", { error });
    return prefetch;
  }

  const refetchedPath = refetched.tempFilePath;
  const refetchedBytes = await fileSize(refetchedPath);
  const keepHandoff = async (outcome: string) => {
    report(outcome, { refetched_bytes: refetchedBytes });
    await removeQuietly(refetchedPath);
    return prefetch;
  };

  if (!refetched.response.ok) return keepHandoff("refetch_bad_status");
  if (!isPdfBuffer(await readHead(refetchedPath))) {
    return keepHandoff("refetch_not_pdf");
  }
  const complete = !(await isTruncatedPdf(
    refetchedPath,
    declaredContentLength(
      Object.fromEntries(refetched.response.headers.entries()),
    ),
  ));
  if (!complete && refetchedBytes <= handoffBytes) {
    return keepHandoff("refetch_incomplete");
  }

  report(complete ? "recovered" : "recovered_longer", {
    refetched_bytes: refetchedBytes,
  });
  await removeQuietly(prefetch.filePath);
  return {
    filePath: refetchedPath,
    url: refetched.response.url || prefetch.url,
    status: refetched.response.status,
    proxyUsed: "basic",
    contentType: prefetch.contentType,
  };
}
