import { Logger } from "winston";
import { AddFeatureError } from "../../error";

export function specialtyScrapeCheck(
  logger: Logger,
  headers: Record<string, string> | undefined,
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
    throw new AddFeatureError(["pdf"]);
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
