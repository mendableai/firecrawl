import OpenAI from "openai";
import { encoding_for_model } from "@dqbd/tiktoken";
import { TiktokenModel } from "@dqbd/tiktoken";
import { Document, ExtractOptions } from "../../../controllers/v1/types";
import { Logger } from "winston";
import { EngineResultsTracker, Meta } from "..";

const maxTokens = 32000;
const modifier = 4;

export class LLMRefusalError extends Error {
    public refusal: string;
    public results: EngineResultsTracker | undefined;

    constructor(refusal: string) {
        super("LLM refused to extract the website's content")
        this.refusal = refusal;
    }
}

function normalizeSchema(x: any): any {
    if (x && x.type === "object") {
        return {
            ...x,
            properties: Object.fromEntries(Object.entries(x.properties).map(([k, v]) => [k, normalizeSchema(v)])),
            required: Object.keys(x.properties),
            additionalProperties: false,
        }
    } else if (x && x.type === "array") {
        return {
            ...x,
            items: normalizeSchema(x.items),
        }
    } else {
        return x;
    }
}

async function generateOpenAICompletions(logger: Logger, document: Document, options: ExtractOptions): Promise<Document> {
    const openai = new OpenAI();
    const model: TiktokenModel = (process.env.MODEL_NAME as TiktokenModel) ?? "gpt-4o-mini";

    if (document.markdown === undefined) {
        throw new Error("document.markdown is undefined -- this is unexpected");
    }

    let extractionContent = document.markdown;

    // count number of tokens
    let numTokens = 0;
    const encoder = encoding_for_model(model as TiktokenModel);
    try {
        // Encode the message into tokens
        const tokens = encoder.encode(extractionContent);
    
        // Return the number of tokens
        numTokens = tokens.length;
    } catch (error) {
        logger.warn("Calculating num tokens of string failed", { error, extractionContent });

        extractionContent = extractionContent.slice(0, maxTokens * modifier);

        const warning = "Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens (" + maxTokens + ") we support.";
        document.warning = document.warning === undefined ? warning : " " + warning;
    } finally {
        // Free the encoder resources after use
        encoder.free();
    }

    if (numTokens > maxTokens) {
        // trim the document to the maximum number of tokens, tokens != characters
        extractionContent = extractionContent.slice(0, maxTokens * modifier);

        const warning = "The extraction content would have used more tokens (" + numTokens + ") than the maximum we allow (" + maxTokens + "). -- the input has been automatically trimmed.";
        document.warning = document.warning === undefined ? warning : " " + warning;
    }

    let schema = options.schema;
    if (schema && schema.type === "array") {
        schema = {
            type: "object",
            properties: {
                items: options.schema,
            },
            required: ["items"],
            additionalProperties: false,
        };
    }

    schema = normalizeSchema(schema);

    const jsonCompletion = await openai.beta.chat.completions.parse({
        model,
        messages: [
            {
                role: "system",
                content: options.systemPrompt,
            },
            {
                role: "user",
                content: [{ type: "text", text: extractionContent }],
            },
            {
                role: "user",
                content: options.prompt !== undefined
                    ? `Transform the above content into structured JSON output based on the following user request: ${options.prompt}`
                    : "Transform the above content into structured JSON output.",
            },
        ],
        response_format: options.schema ? {
            type: "json_schema",
            json_schema: {
                name: "websiteContent",
                schema: schema,
                strict: true,
            }
        } : { type: "json_object" },
    });

    if (jsonCompletion.choices[0].message.refusal !== null) {
        throw new LLMRefusalError(jsonCompletion.choices[0].message.refusal);
    }

    document.extract = jsonCompletion.choices[0].message.parsed;
    if (options.schema && options.schema.type === "array") {
        document.extract = document.extract?.items;
    }
    return document;
}

export async function performLLMExtract(meta: Meta, document: Document): Promise<Document> {
    if (meta.options.formats.includes("extract")) {
        document = await generateOpenAICompletions(meta.logger.child({ method: "performLLMExtract/generateOpenAICompletions" }), document, meta.options.extract!);
    }

    return document;
}
