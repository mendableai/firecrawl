import { parseMarkdown } from "../../../lib/html-to-markdown";
import { Meta } from "..";
import { Document } from "../../../controllers/v1/types";
import { removeUnwantedElements } from "../lib/removeUnwantedElements";
import { extractLinks } from "../lib/extractLinks";
import { extractMetadata } from "../lib/extractMetadata";

export type Transformer = (meta: Meta, document: Document) => Document | Promise<Document>;

export function deriveMetadataFromRawHTML(meta: Meta, document: Document): Document {
    if (document.rawHtml === undefined) {
        throw new Error("rawHtml is undefined -- this transformer is being called out of order");
    }

    document.metadata = {
        ...extractMetadata(meta, document.rawHtml),
        ...document.metadata,
    };
    return document;
}

export function deriveHTMLFromRawHTML(meta: Meta, document: Document): Document {
    if (document.rawHtml === undefined) {
        throw new Error("rawHtml is undefined -- this transformer is being called out of order");
    }

    document.html = removeUnwantedElements(document.rawHtml, meta.options);
    return document;
}

export async function deriveMarkdownFromHTML(_meta: Meta, document: Document): Promise<Document> {
    if (document.html === undefined) {
        throw new Error("html is undefined -- this transformer is being called out of order");
    }

    document.markdown = await parseMarkdown(document.html);
    return document;
}

export function deriveLinksFromHTML(meta: Meta, document: Document): Document {
    // Only derive if the formats has links
    if (meta.options.formats.includes("links")) {
        if (document.html === undefined) {
            throw new Error("html is undefined -- this transformer is being called out of order");
        }

        document.links = extractLinks(document.html, meta.url);
    }

    return document;
}

export function coerceFieldsToFormats(meta: Meta, document: Document): Document {
    const formats = new Set(meta.options.formats);

    if (!formats.has("markdown") && document.markdown !== undefined) {
        delete document.markdown;
    }

    if (!formats.has("rawHtml") && document.rawHtml !== undefined) {
        delete document.rawHtml;
    }

    if (!formats.has("html") && document.html !== undefined) {
        delete document.html;
    }

    if (!formats.has("screenshot") && !formats.has("screenshot@fullPage") && document.screenshot !== undefined) {
        meta.logger.warn("Removed screenshot from Document because it wasn't in formats -- this is very wasteful and indicates a bug.");
        delete document.screenshot;
    }

    if (!formats.has("links") && document.links !== undefined) {
        meta.logger.warn("Removed links from Document because it wasn't in formats -- this is wasteful and indicates a bug.");
        delete document.links;
    }

    if (!formats.has("extract") && document.extract !== undefined) {
        meta.logger.warn("Removed extract from Document because it wasn't in formats -- this is extremely wasteful and indicates a bug.");
        delete document.extract;
    }

    return document;
}

export const transformerStack: Transformer[] = [
    deriveHTMLFromRawHTML,
    deriveMarkdownFromHTML,
    deriveLinksFromHTML,
    deriveMetadataFromRawHTML,
    coerceFieldsToFormats,
];

export async function executeTransformers(meta: Meta, document: Document): Promise<Document> {
    for (const transformer of transformerStack) {
        const _meta = {
            ...meta,
            logger: meta.logger.child({ method: "executeTransformers/" + transformer.name }),
        };
        meta.logger.debug("Executing transformer " + transformer.name + "...", { document });
        const start = Date.now();
        document = await transformer(_meta, document);
        meta.logger.debug("Finished executing transformer " + transformer.name + " (" + (Date.now() - start) + "ms)", { document });
    }

    return document;
}
