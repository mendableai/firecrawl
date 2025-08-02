import { Logger } from "winston";
import { AddFeatureError, DatadomeError } from "../../error";
import { FireEngineCheckStatusSuccess } from "../fire-engine/checkStatus";
import path from "path";
import os from "os";
import { writeFile } from "fs/promises";
import { Meta } from "../..";

async function feResToPdfPrefetch(logger: Logger, feRes: FireEngineCheckStatusSuccess | undefined): Promise<Meta["pdfPrefetch"]> {
  if (!feRes?.file) {
    logger.warn("No file in pdf prefetch");
    return null;
  }

  const filePath = path.join(os.tmpdir(), `tempFile-${crypto.randomUUID()}.pdf`);
  await writeFile(filePath, Buffer.from(feRes.file.content, "base64"))

  return {
    status: feRes.pageStatusCode,
    url: feRes.url,
    filePath,
    proxyUsed: feRes.usedMobileProxy ? "stealth" : "basic",
  };
}

export async function specialtyScrapeCheck(
  logger: Logger,
  headers: Record<string, string> | undefined,
  feRes?: FireEngineCheckStatusSuccess,
) {
  const contentType = (Object.entries(headers ?? {}).find(
    (x) => x[0].toLowerCase() === "content-type",
  ) ?? [])[1];

  if (contentType === undefined) {
    logger.warn("Failed to check contentType -- was not present in headers", {
      headers,
    });
  } else if (
    contentType === "application/pdf" ||
    contentType.startsWith("application/pdf;")
  ) {
    // .pdf
    throw new AddFeatureError(["pdf"], await feResToPdfPrefetch(logger, feRes));
  } else if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    contentType.startsWith(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document;",
    )
  ) {
    // .docx
    throw new AddFeatureError(["docx"]);
  }
}

export function checkDatadomeError(error: Error, meta: Meta): void {
  if (error instanceof DatadomeError) {
    if (meta.options.proxy === "stealth" || meta.options.proxy === "auto") {
      throw new AddFeatureError(["ddAntibot"]);
    } else {
      throw new Error("Datadome anti-bot protection detected. Please use 'stealth' or 'auto' proxy mode to bypass this protection.");
    }
  }
}
