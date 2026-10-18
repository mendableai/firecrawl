import type { Meta } from "../../..";
import { config } from "../../../../../config";
import { getPDFMode } from "../../../../../controllers/v2/types";
import { hasCustomRequestContext } from "../../../lib/request-context";

/** What we hand fire-pdf: a PDF, or a raster image wrapped as a one-page document. */
export type FirePdfSourceKind = "pdf" | "image";

/** How the document reached us: an upload to the parse endpoint, or a scrape. */
export function firePdfRequestKind(meta: Meta): "scrape" | "parse" {
  return meta.internalOptions.isParse === true ||
    meta.internalOptions.uploadedFile !== undefined
    ? "parse"
    : "scrape";
}

/** Whether this PDF must go to FirePDF instead of direct extraction, the
 * FIRE_PDF_PERCENT sample, or the MinerU diversion (see
 * PARSE_PDF_ALWAYS_FIRE_PDF). Fast mode keeps its text-layer-only contract. */
export function parseAlwaysFirePdf(meta: Meta): boolean {
  return (
    firePdfRequestKind(meta) === "parse" &&
    config.PARSE_PDF_ALWAYS_FIRE_PDF &&
    getPDFMode(meta.options.parsers) !== "fast" &&
    !!config.FIRE_PDF_ENABLE &&
    !!config.FIRE_PDF_BASE_URL
  );
}

/** The `tableFormat` sent to FirePDF, or undefined for its default (pipe
 * tables). Only parse requests set one (PARSE_FIRE_PDF_TABLE_FORMAT). */
export function firePdfTableFormat(
  meta: Meta,
): "markdown" | "html" | "dynamic" | undefined {
  if (firePdfRequestKind(meta) !== "parse") return undefined;
  const format = config.PARSE_FIRE_PDF_TABLE_FORMAT;
  return format === "off" ? undefined : format;
}

export function buildFirePdfRequestMetadata(
  meta: Meta,
  sourceKind: FirePdfSourceKind = "pdf",
): {
  source_endpoint: "scrape" | "parse";
  source_request_context: "default" | "custom";
  source_kind: FirePdfSourceKind;
  url?: string;
} {
  const source_endpoint = firePdfRequestKind(meta);
  const isParse = source_endpoint === "parse";
  // Describe supplied request options without forwarding their values.
  const source_request_context = hasCustomRequestContext(meta.options)
    ? "custom"
    : "default";
  // fire-pdf labels its metrics and logs with this so image OCR traffic can
  // be measured — and, if needed, routed — separately from PDF parsing.
  const source_kind = sourceKind;

  // Upload requests use synthetic URLs, and ZDR requests omit URL metadata.
  if (isParse || meta.internalOptions.zeroDataRetention === true) {
    return { source_endpoint, source_request_context, source_kind };
  }

  return {
    source_endpoint,
    source_request_context,
    source_kind,
    url: meta.rewrittenUrl ?? meta.url,
  };
}
