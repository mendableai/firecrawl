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

type PDFProcessorResult = {html: string, markdown?: string};

async function scrapePDFWithLlamaParse(meta: Meta, tempFilePath: string): Promise<PDFProcessorResult> {
    meta.logger.debug("Processing PDF document with LlamaIndex", { tempFilePath });

    const uploadForm = new FormData();

    // This is utterly stupid but it works! - mogery
    uploadForm.append("file", {
        [Symbol.toStringTag]: "Blob",
        name: tempFilePath,
        stream() {
            return createReadStream(tempFilePath) as unknown as ReadableStream<Uint8Array>
        },
        arrayBuffer() {
            throw Error("Unimplemented in mock Blob: arrayBuffer")
        },
        size: (await fs.stat(tempFilePath)).size,
        text() {
            throw Error("Unimplemented in mock Blob: text")
        },
        slice(start, end, contentType) {
            throw Error("Unimplemented in mock Blob: slice")
        },
        type: "application/pdf",
    } as Blob);

    const upload = await robustFetch({
        url: "https://api.cloud.llamaindex.ai/api/parsing/upload",
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.LLAMAPARSE_API_KEY}`,
        },
        body: uploadForm,
        logger: meta.logger.child({ method: "scrapePDFWithLlamaParse/upload/robustFetch" }),
        schema: z.object({
            id: z.string(),
        }),
    });

    const jobId = upload.id;

    // TODO: timeout, retries
    const result = await robustFetch({
        url: `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
        method: "GET",
        headers: {
            "Authorization": `Bearer ${process.env.LLAMAPARSE_API_KEY}`,
        },
        logger: meta.logger.child({ method: "scrapePDFWithLlamaParse/result/robustFetch" }),
        schema: z.object({
            markdown: z.string(),
        }),
        tryCount: 16,
        tryCooldown: 250,
    });
    
    return {
        markdown: result.markdown,
        html: await marked.parse(result.markdown, { async: true }),
    };
}

async function scrapePDFWithParsePDF(meta: Meta, tempFilePath: string): Promise<PDFProcessorResult> {
    meta.logger.debug("Processing PDF document with parse-pdf", { tempFilePath });

    const result = await PdfParse(await fs.readFile(tempFilePath));
    const escaped = escapeHtml(result.text);

    return {
        markdown: escaped,
        html: escaped,
    };
}

export async function scrapePDF(meta: Meta): Promise<EngineScrapeResult> {
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
    if (process.env.LLAMAPARSE_API_KEY) {
        try {
            result = await scrapePDFWithLlamaParse({
                ...meta,
                logger: meta.logger.child({ method: "scrapePDF/scrapePDFWithLlamaParse" }),
            }, tempFilePath);
        } catch (error) {
            meta.logger.warn("LlamaParse failed to parse PDF -- falling back to parse-pdf", { error });
            Sentry.captureException(error);
        }
    }

    if (result === null) {
        result = await scrapePDFWithParsePDF({
            ...meta,
            logger: meta.logger.child({ method: "scrapePDF/scrapePDFWithParsePDF" }),
        }, tempFilePath);
    }

    await fs.unlink(tempFilePath);

    return {
        url: response.url,
        statusCode: response.status,

        html: result.html,
        markdown: result.markdown,
    }
}
