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

const MAX_FILE_SIZE = 19 * 1024 * 1024; // 19MB

async function scrapePDFWithRunPodMU(
  meta: Meta,
  tempFilePath: string,
  timeToRun: number | undefined,
  base64Content: string,
): Promise<PDFProcessorResult> {
  meta.logger.debug("Processing PDF document with RunPod MU", {
    tempFilePath,
  });

  
  const result = await robustFetch({
    url:
      "https://api.runpod.ai/v2/" + process.env.RUNPOD_MU_POD_ID + "/runsync",
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RUNPOD_MU_API_KEY}`,
    },
    body: {
      input: {
        file_content: base64Content,
        filename: path.basename(tempFilePath) + ".pdf",
      },
    },
    logger: meta.logger.child({
      method: "scrapePDFWithRunPodMU/robustFetch",
    }),
    schema: z.object({
      output: z.object({
        markdown: z.string(),
      }),
    }),
  });

  return {
    markdown: result.output.markdown,
    html: await marked.parse(result.output.markdown, { async: true }),
  };
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

  const base64Content = (await readFile(tempFilePath)).toString("base64");

  // Then, if output is too short, pass to RunPod MU
  if (
    // result.markdown && result.markdown.length < 500 &&
    base64Content.length < MAX_FILE_SIZE &&
    process.env.RUNPOD_MU_API_KEY &&
    process.env.RUNPOD_MU_POD_ID
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
        base64Content,
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
  } else {
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
  }

  await unlink(tempFilePath);

  return {
    url: response.url,
    statusCode: response.status,

    html: result?.html ?? "",
    markdown: result?.markdown ?? "",
  };
}
