import dotenv from "dotenv";
import OpenAI from "openai";
import { encoding_for_model } from "@dqbd/tiktoken";
import { TiktokenModel } from "@dqbd/tiktoken";
import { Document, ExtractOptions } from "../../../controllers/v1/types";
import { Logger } from "winston";
import { EngineResultsTracker, Meta } from "..";

dotenv.config();
const maxTokens = 32000;
const modifier = 4;

export class LLMRefusalError extends Error {
  public refusal: string;
  public results: EngineResultsTracker | undefined;

  constructor(refusal: string) {
    super("LLM refused to extract the website's content");
    this.refusal = refusal;
  }
}

function normalizeSchema(x: any): any {
    // Return a basic object if input is null/undefined
    if (!x) return { type: "object", properties: {}, required: [] };

    // If not an object, wrap it in a type definition
    if (typeof x !== "object") {
        return { type: typeof x };
    }

    // Handle $defs
    if (x["$defs"] && typeof x["$defs"] === "object") {
        x["$defs"] = Object.fromEntries(
            Object.entries(x["$defs"])
                .filter(([_, v]) => v !== null && v !== undefined)
                .map(([name, schema]) => [name, normalizeSchema(schema)])
        );
    }

    // Handle array types
    if (x.anyOf && Array.isArray(x.anyOf)) {
        x.anyOf = x.anyOf.filter(item => item !== null && item !== undefined).map(x => normalizeSchema(x));
    }

    if (x.oneOf && Array.isArray(x.oneOf)) {
        x.oneOf = x.oneOf.filter(item => item !== null && item !== undefined).map(x => normalizeSchema(x));
    }

    if (x.allOf && Array.isArray(x.allOf)) {
        x.allOf = x.allOf.filter(item => item !== null && item !== undefined).map(x => normalizeSchema(x));
    }

    if (x.not !== undefined && x.not !== null) {
        x.not = normalizeSchema(x.not);
    }

    // Handle object type
    if (x.type === "object") {
        const properties = x.properties || {};
        return {
            ...x,
            properties: Object.fromEntries(
                Object.entries(properties)
                    .filter(([_, v]) => v !== null && v !== undefined)
                    .map(([k, v]) => [k, normalizeSchema(v)])
            ),
            required: Array.isArray(x.required) ? x.required : (properties ? Object.keys(properties) : []),
            additionalProperties: x.additionalProperties ?? false,
        };
    }

    // Handle array type
    if (x.type === "array") {
        return {
            ...x,
            items: x.items ? normalizeSchema(x.items) : { type: "string" },
        };
    }

    return x;
}

type LLMProvider = 'openai' | 'ollama';

interface OllamaResponse {
    response: string;
    done: boolean;
}

export class LLMProviderError extends Error {
    constructor(message: string) {
        super(`LLM Provider Error: ${message}`);
    }
}

interface MessageContent {
    type: 'text';
    text: string;
}

async function generateOllamaCompletion(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    ollamaUrl: string,
    schema?: any
): Promise<{ content: string }> {
    console.log('Ollama Messages:', messages);
    
    try {
        const requestBody: any = {
            model,
            messages,
            stream: false,
        };

        if (schema) {
            requestBody.format = schema;
        }

        const response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new LLMProviderError(`Ollama API returned ${response.status}`);
        }

        const data = await response.json();
        console.log('Ollama Response:', data);

        if (!data.message) {
            throw new LLMProviderError('Ollama response is missing content');
        }

        return { content: data.message };
    } catch (error) {
        console.error('Ollama API Error:', error);
        throw error;
    }
}

export async function generateLLMCompletions(
    logger: Logger,
    options: ExtractOptions,
    markdown?: string,
    previousWarning?: string,
    isExtractEndpoint?: boolean
): Promise<{ extract: any; numTokens: number; warning: string | undefined }> {
    let extract: any;
    let warning: string | undefined;
    let numTokens = 0;

    const llmProvider = (process.env.LLM_PROVIDER || 'openai') as LLMProvider;
    const model = process.env.MODEL_NAME ?? (llmProvider === 'openai' ? 'gpt-4-turbo-preview' : 'llama2:latest');

    if (markdown === undefined) {
        throw new Error('document.markdown is undefined -- this is unexpected');
    }

    // Token counting only for OpenAI
    if (llmProvider === 'openai') {
        const encoder = encoding_for_model(model as TiktokenModel);
        try {
            const tokens = encoder.encode(markdown);
            numTokens = tokens.length;
        } catch (error) {
            logger.warn('Calculating num tokens of string failed', { error, markdown });
            markdown = markdown.slice(0, maxTokens * modifier);
            let w = `Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens (${maxTokens}) we support.`;
            warning = previousWarning === undefined ? w : w + ' ' + previousWarning;
        } finally {
            encoder.free();
        }

        if (numTokens > maxTokens) {
            markdown = markdown.slice(0, maxTokens * modifier);
            const w = `The extraction content would have used more tokens (${numTokens}) than the maximum we allow (${maxTokens}). -- the input has been automatically trimmed.`;
            warning = previousWarning === undefined ? w : w + ' ' + previousWarning;
        }
    } else {
        // For Ollama, use a simple character-based limit
        if (markdown.length > maxTokens * modifier) {
            markdown = markdown.slice(0, maxTokens * modifier);
            const w = `The input text was too long and has been trimmed to ${maxTokens * modifier} characters.`;
            warning = previousWarning === undefined ? w : w + ' ' + previousWarning;
        }
        // Approximate token count for non-OpenAI models (rough estimate)
        numTokens = Math.ceil(markdown.length / 4);
    }

    // Schema normalization (keep existing schema normalization code)
    let schema = options.schema;
    if (schema) {
        try {
            if (schema.type === 'array') {
                schema = {
                    type: 'object',
                    properties: {
                        items: schema,
                    },
                    required: ['items'],
                    additionalProperties: false,
                };
            } else if (typeof schema === 'object' && !schema.type && Object.keys(schema || {}).length > 0) {
                schema = {
                    type: 'object',
                    properties: Object.fromEntries(
                        Object.entries(schema || {})
                            .filter(([_, v]) => v !== null && v !== undefined)
                            .map(([key, value]) => [key, { type: value }])
                    ),
                    required: Object.keys(schema || {}),
                    additionalProperties: false,
                };
            }

            schema = normalizeSchema(schema);
        } catch (error) {
            logger.error('Schema normalization failed', { error, schema });
            schema = { type: "object", properties: {}, required: [] };
        }
    }

    const messages = [
        {
            role: 'system',
            content: options.systemPrompt,
        },
        {
            role: 'user',
            content: [{ type: "text" as const, text: markdown }],
        },
        {
            role: 'user',
            content: options.prompt !== undefined
                ? `Transform the above content into structured JSON output based on the following user request: ${options.prompt}`
                : 'Transform the above content into structured JSON output.',
        },
    ] satisfies Array<{
        role: 'system' | 'user' | 'assistant';
        content: string | Array<{ type: 'text'; text: string; }>;
    }>;

    try {
        let jsonCompletion;

        if (llmProvider === 'openai') {
            if (!process.env.OPENAI_API_KEY) {
                throw new LLMProviderError('OpenAI API key is not configured');
            }
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });

            jsonCompletion = await openai.beta.chat.completions.parse({
                model,
                temperature: 0,
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                response_format: options.schema
                    ? {
                          type: 'json_schema',
                          json_schema: {
                              name: 'websiteContent',
                              schema: schema,
                              strict: true,
                          },
                      }
                    : { type: 'json_object' },
            });

            if (jsonCompletion.choices[0].message.refusal !== null) {
                throw new LLMRefusalError(jsonCompletion.choices[0].message.refusal);
            }

            extract = jsonCompletion.choices[0].message.parsed;
        } else if (llmProvider === 'ollama') {
            const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
            const ollamaMessages = messages.map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string' 
                    ? msg.content 
                    : Array.isArray(msg.content) 
                        ? msg.content[0].text 
                        : (msg.content as MessageContent).text
            }));

            try {
                jsonCompletion = await generateOllamaCompletion(
                    model, 
                    ollamaMessages, 
                    ollamaUrl,
                    options.schema ? {
                        type: 'object',
                        properties: schema.properties || {},
                        required: schema.required || [],
                        additionalProperties: schema.additionalProperties ?? false,
                    } : undefined
                );
                console.log('Ollama Completion:', jsonCompletion);

                if (!jsonCompletion.content) {
                    throw new LLMRefusalError('Ollama returned empty response');
                }

                try {
                    if (typeof jsonCompletion.content === 'string') {
                        extract = JSON.parse(jsonCompletion.content);
                    } else {
                        extract = jsonCompletion.content;
                    }
                } catch (e) {
                    logger.error('Failed to parse Ollama JSON response', { 
                        error: e, 
                        content: jsonCompletion.content,
                        messages: ollamaMessages 
                    });
                    throw new LLMRefusalError('Failed to parse returned JSON from Ollama.');
                }
            } catch (error) {
                logger.error('Ollama completion failed', { error, messages: ollamaMessages });
                throw error;
            }
        } else {
            throw new LLMProviderError(`Unsupported LLM provider: ${llmProvider}`);
        }

        if (extract === null && jsonCompletion.choices?.[0]?.message?.content !== null) {
            try {
                if (!isExtractEndpoint) {
                    extract = JSON.parse(jsonCompletion.choices[0].message.content);
                } else {
                    const extractData = JSON.parse(jsonCompletion.choices[0].message.content);
                    extract = options.schema ? extractData.data.extract : extractData;
                }
            } catch (e) {
                logger.error('Failed to parse returned JSON, no schema specified.', { error: e });
                throw new LLMRefusalError('Failed to parse returned JSON. Please specify a schema in the extract object.');
            }
        }

        if (options.schema && options.schema.type === 'array' && !schema?.required?.includes('items')) {
            extract = extract?.items;
        }

        return { extract, warning, numTokens };
    } catch (error) {
        logger.error('LLM completion failed', { error });
        throw error;
    }
}

export async function performLLMExtract(meta: Meta, document: Document): Promise<Document> {
    if (meta.options.formats.includes('extract')) {
        const { extract, warning } = await generateLLMCompletions(
            meta.logger.child({ method: 'performLLMExtract/generateLLMCompletions' }),
            meta.options.extract!,
            document.markdown,
            document.warning,
        );
        document.extract = extract;
        document.warning = warning;
    }

  return document;
}
