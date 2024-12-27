import { Meta } from "../..";
import { EngineScrapeResult } from "..";
import * as marked from "marked";
import { robustFetch } from "../../lib/fetch";
import { z } from "zod";
import * as Sentry from "@sentry/node";
import escapeHtml from "escape-html";
import PdfParse from "pdf-parse";
import { downloadFile, fetchFileToBuffer } from "../utils/downloadFile";
import { RemoveFeatureError, UnsupportedFileError } from "../../error";
import { stat, readFile, unlink } from "node:fs/promises";
import path from "node:path";

type PDFProcessorResult = { html: string; markdown?: string };

async function scrapePDFWithRunPodMU(
  meta: Meta,
  tempFilePath: string,
  timeToRun: number | undefined,
): Promise<PDFProcessorResult> {
  meta.logger.debug("Processing PDF document with RunPod MU", {
    tempFilePath,
  });

  const fileStat = await stat(tempFilePath);
  if (fileStat.size > ((2**10)**2)*10) {
    throw new UnsupportedFileError("File is larger than PDF parser limit (10MiB)");
  }

  console.log(tempFilePath);

  const upload = await robustFetch({
    url: "https://api.runpod.ai/v2/" + process.env.RUNPOD_MU_POD_ID + "/run",
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RUNPOD_MU_API_KEY}`,
    },
    body: {
      input: {
        file_content: (await readFile(tempFilePath)).toString("base64"),
        filename: path.basename(tempFilePath) + ".pdf",
      },
    },
    logger: meta.logger.child({
      method: "scrapePDFWithRunPodMU/upload/robustFetch",
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
        url: `https://api.runpod.ai/v2/${process.env.RUNPOD_MU_POD_ID}/status/${jobId}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.RUNPOD_MU_API_KEY}`,
        },
        logger: meta.logger.child({
          method: "scrapePDFWithRunPodMU/result/robustFetch",
        }),
        schema: z.object({
          status: z.string(),
          error: z.any().optional(),
          output: z.object({
            markdown: z.string(),
          }).optional(),
        }),
      });
      
      if (result.status === "COMPLETED") {
        return {
          markdown: result.output!.markdown,
          html: await marked.parse(result.output!.markdown, { async: true }),
        };
      }

      if (result.status === "FAILED") {
        throw new Error("RunPod MU failed to parse PDF: " + result.error!, { cause: result.error });
      }

      // result not up yet
    } catch (e) {
      if (e instanceof Error && e.message === "Request sent failure status") {
        // if ((e.cause as any).response.status === 404) {
        //   // no-op, result not up yet
        // } else if ((e.cause as any).response.body.includes("PDF_IS_BROKEN")) {
        //   // URL is not a PDF, actually!
        //   meta.logger.debug("URL is not actually a PDF, signalling...");
        //   throw new RemoveFeatureError(["pdf"]);
        // } else {
          throw new Error("RunPod MU threw an error", {
            cause: e.cause,
          });
        // }
      } else {
        throw e;
      }
    }

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 250));
  }

  throw new Error("RunPod MU timed out");
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

  // Then, if output is too short, pass to RunPod MU
  if (
    result.markdown && result.markdown.length < 500 &&
    process.env.RUNPOD_MU_API_KEY && process.env.RUNPOD_MU_POD_ID
  ) {
    try {
      const muResult = await scrapePDFWithRunPodMU(
        {
          ...meta,
          logger: meta.logger.child({
            method: "scrapePDF/scrapePDFWithRunPodMU",
          }),
        },
        tempFilePath,
        timeToRun,
      );
      result = muResult; // Use LlamaParse result if successful
    } catch (error) {
      if (error instanceof Error && error.message === "RunPod MU timed out") {
        meta.logger.warn("RunPod MU timed out -- using parse-pdf result", {
          error,
        });
      } else if (error instanceof RemoveFeatureError) {
        throw error;
      } else {
        meta.logger.warn(
          "RunPod MU failed to parse PDF -- using parse-pdf result",
          { error },
        );
        Sentry.captureException(error);
      }
    }
  }

  await unlink(tempFilePath);

  return {
    url: response.url,
    statusCode: response.status,

    html: result.html,
    markdown: result.markdown,
  };
}
