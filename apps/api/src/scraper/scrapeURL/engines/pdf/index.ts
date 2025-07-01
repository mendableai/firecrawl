import { Meta } from "../..";
import { EngineScrapeResult } from "..";
import * as marked from "marked";
import { robustFetch } from "../../lib/fetch";
import { z } from "zod";
import * as Sentry from "@sentry/node";
import escapeHtml from "escape-html";
import PdfParse from "pdf-parse";
import { downloadFile, fetchFileToBuffer } from "../utils/downloadFile";
import {
  PDFAntibotError,
  PDFInsufficientTimeError,
  PDFPrefetchFailed,
  RemoveFeatureError,
  TimeoutError,
} from "../../error";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { Response } from "undici";
import { getPageCount } from "../../../../lib/pdf-parser";
import { getPdfResultFromCache, savePdfResultToCache } from "../../../../lib/gcs-pdf-cache";

type PDFProcessorResult = { html: string; markdown?: string };

const MAX_FILE_SIZE = 19 * 1024 * 1024; // 19MB
const MILLISECONDS_PER_PAGE = 150;

async function scrapePDFWithRunPodMU(
  meta: Meta,
  tempFilePath: string,
  timeToRun: number | undefined,
  base64Content: string,
): Promise<PDFProcessorResult> {
  meta.logger.debug("Processing PDF document with RunPod MU", {
    tempFilePath,
  });

  const preCacheCheckStartTime = Date.now();

  try {
    const cachedResult = await getPdfResultFromCache(base64Content);
    if (cachedResult) {
      meta.logger.info("Using cached RunPod MU result for PDF", {
        tempFilePath,
      });
      return cachedResult;
    }
  } catch (error) {
    meta.logger.warn("Error checking PDF cache, proceeding with RunPod MU", {
      error,
      tempFilePath,
    });
  }

  const timeout = timeToRun
    ? timeToRun - (Date.now() - preCacheCheckStartTime)
    : undefined;
  if (timeout && timeout < 0) {
    throw new TimeoutError("MU PDF parser already timed out before call");
  }

  const abort = timeout ? AbortSignal.timeout(timeout) : undefined;

  const podStart = await robustFetch({
    url:
      "https://api.runpod.ai/v2/" + process.env.RUNPOD_MUV2_POD_ID + "/runsync",
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RUNPOD_MU_API_KEY}`,
    },
    body: {
      input: {
        file_content: base64Content,
        filename: path.basename(tempFilePath) + ".pdf",
        timeout,
        created_at: Date.now(),
      },
    },
    logger: meta.logger.child({
      method: "scrapePDFWithRunPodMU/runsync/robustFetch",
    }),
    schema: z.object({
      id: z.string(),
      status: z.string(),
      output: z
        .object({
          markdown: z.string(),
        })
        .optional(),
    }),
    mock: meta.mock,
    abort,
  });



  let status: string = podStart.status;
  let result: { markdown: string } | undefined = podStart.output;

  if (status === "IN_QUEUE" || status === "IN_PROGRESS") {
    do {
      abort?.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      abort?.throwIfAborted();
      const podStatus = await robustFetch({
        url: `https://api.runpod.ai/v2/${process.env.RUNPOD_MU_POD_ID}/status/${podStart.id}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.RUNPOD_MU_API_KEY}`,
        },
        logger: meta.logger.child({
          method: "scrapePDFWithRunPodMU/status/robustFetch",
        }),
        schema: z.object({
          status: z.string(),
          output: z
            .object({
              markdown: z.string(),
            })
            .optional(),
        }),
        mock: meta.mock,
        abort,
      });
      status = podStatus.status;
      result = podStatus.output;
    } while (status !== "COMPLETED" && status !== "FAILED");
  }

  if (status === "FAILED") {
    throw new Error("RunPod MU failed to parse PDF");
  }

  if (!result) {
    throw new Error("RunPod MU returned no result");
  }

  const processorResult = {
    markdown: result.markdown,
    html: await marked.parse(result.markdown, { async: true }),
  };

  if (!meta.internalOptions.zeroDataRetention) {
    try {
      await savePdfResultToCache(base64Content, processorResult);
    } catch (error) {
      meta.logger.warn("Error saving PDF to cache", {
        error,
        tempFilePath,
      });
    }
  }

  return processorResult;
}

async function scrapePDFWithParsePDF(
  meta: Meta,
  tempFilePath: string,
): Promise<PDFProcessorResult> {
  meta.logger.debug("Processing PDF document with parse-pdf", { tempFilePath });

  const result = await PdfParse(await readFile(tempFilePath));
  const escaped = escapeHtml(result.text);

  return {
    markdown: escaped,
    html: escaped,
  };
}

export async function scrapePDF(
  meta: Meta,
  timeToRun: number | undefined,
): Promise<EngineScrapeResult> {
  const startTime = Date.now();

  if (!meta.options.parsePDF) {
    if (meta.pdfPrefetch !== undefined && meta.pdfPrefetch !== null) {
      const content = (await readFile(meta.pdfPrefetch.filePath)).toString(
        "base64",
      );
      return {
        url: meta.pdfPrefetch.url ?? meta.rewrittenUrl ?? meta.url,
        statusCode: meta.pdfPrefetch.status,

        html: content,
        markdown: content,

        proxyUsed: meta.pdfPrefetch.proxyUsed,
      };
    } else {
      const file = await fetchFileToBuffer(meta.rewrittenUrl ?? meta.url, {
        headers: meta.options.headers,
      });

      const ct = file.response.headers.get("Content-Type");
      if (ct && !ct.includes("application/pdf")) {
        // if downloaded file wasn't a PDF
        if (meta.pdfPrefetch === undefined) {
          throw new PDFAntibotError();
        } else {
          throw new PDFPrefetchFailed();
        }
      }

      const content = file.buffer.toString("base64");
      return {
        url: file.response.url,
        statusCode: file.response.status,

        html: content,
        markdown: content,

        proxyUsed: "basic",
      };
    }
  }

  const { response, tempFilePath } =
    meta.pdfPrefetch !== undefined && meta.pdfPrefetch !== null
      ? { response: meta.pdfPrefetch, tempFilePath: meta.pdfPrefetch.filePath }
      : await downloadFile(meta.id, meta.rewrittenUrl ?? meta.url, {
          headers: meta.options.headers,
        });

  if ((response as any).headers) {
    // if downloadFile was used
    const r: Response = response as any;
    const ct = r.headers.get("Content-Type");
    if (ct && !ct.includes("application/pdf")) {
      // if downloaded file wasn't a PDF
      if (meta.pdfPrefetch === undefined) {
        throw new PDFAntibotError();
      } else {
        throw new PDFPrefetchFailed();
      }
    }
  }

  const pageCount = await getPageCount(tempFilePath);
  if (pageCount * MILLISECONDS_PER_PAGE > (timeToRun ?? Infinity)) {
    throw new PDFInsufficientTimeError(
      pageCount,
      pageCount * MILLISECONDS_PER_PAGE + 5000,
    );
  }

  let result: PDFProcessorResult | null = null;

  const base64Content = (await readFile(tempFilePath)).toString("base64");

  // First try RunPod MU if conditions are met
  if (
    base64Content.length < MAX_FILE_SIZE &&
    process.env.RUNPOD_MU_API_KEY &&
    process.env.RUNPOD_MU_POD_ID
  ) {
    try {
      result = await scrapePDFWithRunPodMU(
        {
          ...meta,
          logger: meta.logger.child({
            method: "scrapePDF/scrapePDFWithRunPodMU",
          }),
        },
        tempFilePath,
        timeToRun ? timeToRun - (Date.now() - startTime) : undefined,
        base64Content,
      );
    } catch (error) {
      if (
        error instanceof RemoveFeatureError ||
        error instanceof TimeoutError
      ) {
        throw error;
      } else if (
        (error instanceof Error && error.name === "TimeoutError") ||
        (error instanceof Error &&
          error.message === "Request failed" &&
          error.cause &&
          error.cause instanceof Error &&
          error.cause.name === "TimeoutError")
      ) {
        throw new TimeoutError(
          "PDF parsing timed out, please increase the timeout parameter in your scrape request",
        );
      }
      meta.logger.warn(
        "RunPod MU failed to parse PDF (could be due to timeout) -- falling back to parse-pdf",
        { error },
      );
      Sentry.captureException(error);
    }
  }

  // If RunPod MU failed or wasn't attempted, use PdfParse
  if (!result) {
    result = await scrapePDFWithParsePDF(
      {
        ...meta,
        logger: meta.logger.child({
          method: "scrapePDF/scrapePDFWithParsePDF",
        }),
      },
      tempFilePath,
    );
  }

  await unlink(tempFilePath);

  return {
    url: response.url ?? meta.rewrittenUrl ?? meta.url,
    statusCode: response.status,
    html: result?.html ?? "",
    markdown: result?.markdown ?? "",
    numPages: pageCount,

    proxyUsed: "basic",
  };
}
