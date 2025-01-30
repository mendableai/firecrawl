import { parseMarkdown } from "../../../lib/html-to-markdown";
import { Meta } from "..";
import { Document } from "../../../controllers/v1/types";
import { htmlTransform } from "../lib/removeUnwantedElements";
import { extractLinks } from "../lib/extractLinks";
import { extractMetadata } from "../lib/extractMetadata";
import { performLLMExtract } from "./llmExtract";
import { uploadScreenshot } from "./uploadScreenshot";
import { removeBase64Images } from "./removeBase64Images";
import { saveToCache } from "./cache";

export type Transformer = (
  meta: Meta,
  document: Document,
) => Document | Promise<Document>;

export async function deriveMetadataFromRawHTML(
  meta: Meta,
  document: Document,
): Promise<Document> {
  if (document.rawHtml === undefined) {
    throw new Error(
      "rawHtml is undefined -- this transformer is being called out of order",
    );
  }

  document.metadata = {
    ...(await extractMetadata(meta, document.rawHtml)),
    ...document.metadata,
  };
  return document;
}

export async function deriveHTMLFromRawHTML(
  meta: Meta,
  document: Document,
): Promise<Document> {
  if (document.rawHtml === undefined) {
    throw new Error(
      "rawHtml is undefined -- this transformer is being called out of order",
    );
  }

  document.html = await htmlTransform(
    document.rawHtml,
    document.metadata.url ?? document.metadata.sourceURL ?? meta.url,
    meta.options,
  );
  return document;
}

export async function deriveMarkdownFromHTML(
  _meta: Meta,
  document: Document,
): Promise<Document> {
  if (document.html === undefined) {
    throw new Error(
      "html is undefined -- this transformer is being called out of order",
    );
  }

  document.markdown = await parseMarkdown(document.html);
  return document;
}

export async function deriveLinksFromHTML(meta: Meta, document: Document): Promise<Document> {
  // Only derive if the formats has links
  if (meta.options.formats.includes("links")) {
    if (document.html === undefined) {
      throw new Error(
        "html is undefined -- this transformer is being called out of order",
      );
    }

    document.links = await extractLinks(document.html, meta.url);
  }

  return document;
}

export function coerceFieldsToFormats(
  meta: Meta,
  document: Document,
): Document {
  const formats = new Set(meta.options.formats);

  if (!formats.has("markdown") && document.markdown !== undefined) {
    delete document.markdown;
  } else if (formats.has("markdown") && document.markdown === undefined) {
    meta.logger.warn(
      "Request had format: markdown, but there was no markdown field in the result.",
    );
  }

  if (!formats.has("rawHtml") && document.rawHtml !== undefined) {
    delete document.rawHtml;
  } else if (formats.has("rawHtml") && document.rawHtml === undefined) {
    meta.logger.warn(
      "Request had format: rawHtml, but there was no rawHtml field in the result.",
    );
  }

  if (!formats.has("html") && document.html !== undefined) {
    delete document.html;
  } else if (formats.has("html") && document.html === undefined) {
    meta.logger.warn(
      "Request had format: html, but there was no html field in the result.",
    );
  }

  if (
    !formats.has("screenshot") &&
    !formats.has("screenshot@fullPage") &&
    document.screenshot !== undefined
  ) {
    meta.logger.warn(
      "Removed screenshot from Document because it wasn't in formats -- this is very wasteful and indicates a bug.",
    );
    delete document.screenshot;
  } else if (
    (formats.has("screenshot") || formats.has("screenshot@fullPage")) &&
    document.screenshot === undefined
  ) {
    meta.logger.warn(
      "Request had format: screenshot / screenshot@fullPage, but there was no screenshot field in the result.",
    );
  }

  if (!formats.has("links") && document.links !== undefined) {
    meta.logger.warn(
      "Removed links from Document because it wasn't in formats -- this is wasteful and indicates a bug.",
    );
    delete document.links;
  } else if (formats.has("links") && document.links === undefined) {
    meta.logger.warn(
      "Request had format: links, but there was no links field in the result.",
    );
  }

  if (!formats.has("extract") && document.extract !== undefined) {
    meta.logger.warn(
      "Removed extract from Document because it wasn't in formats -- this is extremely wasteful and indicates a bug.",
    );
    delete document.extract;
  } else if (formats.has("extract") && document.extract === undefined) {
    meta.logger.warn(
      "Request had format: extract, but there was no extract field in the result.",
    );
  }

  if (meta.options.actions === undefined || meta.options.actions.length === 0) {
    delete document.actions;
  }

  return document;
}

// TODO: allow some of these to run in parallel
export const transformerStack: Transformer[] = [
  saveToCache,
  deriveHTMLFromRawHTML,
  deriveMarkdownFromHTML,
  deriveLinksFromHTML,
  deriveMetadataFromRawHTML,
  uploadScreenshot,
  performLLMExtract,
  coerceFieldsToFormats,
  removeBase64Images,
];

export async function executeTransformers(
  meta: Meta,
  document: Document,
): Promise<Document> {
  const executions: [string, number][] = [];

  for (const transformer of transformerStack) {
    const _meta = {
      ...meta,
      logger: meta.logger.child({
        method: "executeTransformers/" + transformer.name,
      }),
    };
    const start = Date.now();
    document = await transformer(_meta, document);
    executions.push([transformer.name, Date.now() - start]);
  }

  meta.logger.debug("Executed transformers.", { executions });

  return document;
}
