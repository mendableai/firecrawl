import { createReadStream, promises as fs } from "node:fs";
import { Meta } from "../..";
import { EngineScrapeResult } from "..";
import * as marked from "marked";
import { robustFetch } from "../../lib/fetch";
import { z } from "zod";
import * as Sentry from "@sentry/node";
import escapeHtml from "escape-html";
import PdfParse from "pdf-parse";
import { downloadFile, fetchFileToBuffer } from "../utils/downloadFile";
import { RemoveFeatureError } from "../../error";

type PDFProcessorResult = { html: string; markdown?: string };

async function scrapePDFWithLlamaParse(
  meta: Meta,
  tempFilePath: string,
  timeToRun: number | undefined,
): Promise<PDFProcessorResult> {
  meta.logger.debug("Processing PDF document with LlamaIndex", {
    tempFilePath,
  });

  const uploadForm = new FormData();

  // This is utterly stupid but it works! - mogery
  uploadForm.append("file", {
    [Symbol.toStringTag]: "Blob",
    name: tempFilePath,
    stream() {
      return createReadStream(
        tempFilePath,
      ) as unknown as ReadableStream<Uint8Array>;
    },
    arrayBuffer() {
      throw Error("Unimplemented in mock Blob: arrayBuffer");
    },
    size: (await fs.stat(tempFilePath)).size,
    text() {
      throw Error("Unimplemented in mock Blob: text");
    },
    slice(start, end, contentType) {
      throw Error("Unimplemented in mock Blob: slice");
    },
    type: "application/pdf",
  } as Blob);

  const upload = await robustFetch({
    url: "https://api.cloud.llamaindex.ai/api/parsing/upload",
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LLAMAPARSE_API_KEY}`,
    },
    body: uploadForm,
    logger: meta.logger.child({
      method: "scrapePDFWithLlamaParse/upload/robustFetch",
    }),
    schema: z.object({
      id: z.string(),
    }),
  });

  const jobId = upload.id;

  // TODO: timeout, retries
  const startedAt = Date.now();
  const timeout = timeToRun ?? 300000;

  while (Date.now() <= startedAt + timeout) {
    try {
      const result = await robustFetch({
        url: `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.LLAMAPARSE_API_KEY}`,
        },
        logger: meta.logger.child({
          method: "scrapePDFWithLlamaParse/result/robustFetch",
        }),
        schema: z.object({
          markdown: z.string(),
        }),
      });
      return {
        markdown: result.markdown,
        html: await marked.parse(result.markdown, { async: true }),
      };
    } catch (e) {
      if (e instanceof Error && e.message === "Request sent failure status") {
        if ((e.cause as any).response.status === 404) {
          // no-op, result not up yet
        } else if ((e.cause as any).response.body.includes("PDF_IS_BROKEN")) {
          // URL is not a PDF, actually!
          meta.logger.debug("URL is not actually a PDF, signalling...");
          throw new RemoveFeatureError(["pdf"]);
        } else {
          throw new Error("LlamaParse threw an error", {
            cause: e.cause,
          });
        }
      } else {
        throw e;
      }
    }

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 250));
  }

  throw new Error("LlamaParse timed out");
}

async function scrapePDFWithParsePDF(
  meta: Meta,
  tempFilePath: string,
): Promise<PDFProcessorResult> {
  meta.logger.debug("Processing PDF document with parse-pdf", { tempFilePath });

  const result = await PdfParse(await fs.readFile(tempFilePath));
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
  if (!meta.options.parsePDF) {
    const file = await fetchFileToBuffer(meta.url);
    const content = file.buffer.toString("base64");
    return {
      url: file.response.url,
      statusCode: file.response.status,

      html: content,
      markdown: content,
    };
  }

  const { response, tempFilePath } = await downloadFile(meta.id, meta.url);

  let result: PDFProcessorResult | null = null;

  // First, try parsing with PdfParse
  result = await scrapePDFWithParsePDF(
    {
      ...meta,
      logger: meta.logger.child({
        method: "scrapePDF/scrapePDFWithParsePDF",
      }),
    },
    tempFilePath,
  );

  // If the parsed text is under 500 characters and LLAMAPARSE_API_KEY exists, try LlamaParse
  if (
    result.markdown &&
    result.markdown.length < 500 &&
    process.env.LLAMAPARSE_API_KEY
  ) {
    try {
      const llamaResult = await scrapePDFWithLlamaParse(
        {
          ...meta,
          logger: meta.logger.child({
            method: "scrapePDF/scrapePDFWithLlamaParse",
          }),
        },
        tempFilePath,
        timeToRun,
      );
      result = llamaResult; // Use LlamaParse result if successful
    } catch (error) {
      if (error instanceof Error && error.message === "LlamaParse timed out") {
        meta.logger.warn("LlamaParse timed out -- using parse-pdf result", {
          error,
        });
      } else if (error instanceof RemoveFeatureError) {
        throw error;
      } else {
        meta.logger.warn(
          "LlamaParse failed to parse PDF -- using parse-pdf result",
          { error },
        );
        Sentry.captureException(error);
      }
    }
  }

  await fs.unlink(tempFilePath);

  return {
    url: response.url,
    statusCode: response.status,

    html: result.html,
    markdown: result.markdown,
  };
}
