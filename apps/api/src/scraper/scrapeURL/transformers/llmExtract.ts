import { encoding_for_model } from "@dqbd/tiktoken";
import { TiktokenModel } from "@dqbd/tiktoken";
import {
  Document,
  ExtractOptions,
  TokenUsage,
} from "../../../controllers/v1/types";
import { Logger } from "winston";
import { EngineResultsTracker, Meta } from "..";
import { logger } from "../../../lib/logger";
import { modelPrices } from "../../../lib/extract/usage/model-prices";
import { generateObject, generateText, LanguageModel } from 'ai';
import { jsonSchema } from 'ai';
import { getModel } from "../../../lib/generic-ai";
import { z } from "zod";

// Get max tokens from model prices
const getModelLimits = (model: string) => {
  const modelConfig = modelPrices[model];
  if (!modelConfig) {
    // Default fallback values
    return {
      maxInputTokens: 8192,
      maxOutputTokens: 4096,
      maxTokens: 12288,
    };
  }
  return {
    maxInputTokens: modelConfig.max_input_tokens || modelConfig.max_tokens,
    maxOutputTokens: modelConfig.max_output_tokens || modelConfig.max_tokens,
    maxTokens: modelConfig.max_tokens,
  };
};

export class LLMRefusalError extends Error {
  public refusal: string;
  public results: EngineResultsTracker | undefined;

  constructor(refusal: string) {
    super("LLM refused to extract the website's content");
    this.refusal = refusal;
  }
}

function normalizeSchema(x: any): any {
  if (typeof x !== "object" || x === null) return x;

  if (x["$defs"] !== null && typeof x["$defs"] === "object") {
    x["$defs"] = Object.fromEntries(
      Object.entries(x["$defs"]).map(([name, schema]) => [
        name,
        normalizeSchema(schema),
      ]),
    );
  }

  if (x && x.anyOf) {
    x.anyOf = x.anyOf.map((x) => normalizeSchema(x));
  }

  if (x && x.oneOf) {
    x.oneOf = x.oneOf.map((x) => normalizeSchema(x));
  }

  if (x && x.allOf) {
    x.allOf = x.allOf.map((x) => normalizeSchema(x));
  }

  if (x && x.not) {
    x.not = normalizeSchema(x.not);
  }

  if (x && x.type === "object") {
    return {
      ...x,
      properties: Object.fromEntries(
        Object.entries(x.properties).map(([k, v]) => [k, normalizeSchema(v)]),
      ),
      required: Object.keys(x.properties),
      additionalProperties: false,
    };
  } else if (x && x.type === "array") {
    return {
      ...x,
      items: normalizeSchema(x.items),
    };
  } else {
    return x;
  }
}

export function truncateText(text: string, maxTokens: number): string {
  const modifier = 3; // Estimate: 1 token ≈ 3-4 characters for safety
  try {
    const encoder = encoding_for_model("gpt-4o");
    // Continuously trim the text until its token count is within the limit.
    while (true) {
      const tokens = encoder.encode(text);
      if (tokens.length <= maxTokens) {
        return text;
      }
      // Calculate a new length using a more conservative approach
      // Instead of scaling the entire text, we'll remove a smaller portion
      const ratio = maxTokens / tokens.length;
      const newLength = Math.max(
        Math.ceil(text.length * ratio),
        Math.floor(text.length * 0.8)  // Never remove more than 20% at once
      );
      if (newLength <= 0) {
        return "";
      }
      text = text.slice(0, newLength);
    }
  } catch (error) {
    // Fallback using character-based estimation.
    if (text.length <= maxTokens * modifier) {
      return text;
    }
    return text.slice(0, maxTokens * modifier);
  }
}

export async function generateCompletions({
  logger,
  options,
  markdown,
  previousWarning,
  isExtractEndpoint,
  model = getModel("gpt-4o-mini"),
}: {
  model?: LanguageModel; 
  logger: Logger;
  options: ExtractOptions;
  markdown?: string;
  previousWarning?: string;
  isExtractEndpoint?: boolean;
}): Promise<{
  extract: any;
  numTokens: number;
  warning: string | undefined;
  totalUsage: TokenUsage;
  model: string;
}> {
  let extract: any;
  let warning: string | undefined;

  if (markdown === undefined) {
    throw new Error("document.markdown is undefined -- this is unexpected");
  }

  const { maxInputTokens, maxOutputTokens } = getModelLimits(model.modelId);

  // Ratio of 4 was way too high, now 3.5.
  const modifier = 3.5; // tokens to characters ratio
  // Calculate 80% of max input tokens (for content)
  const maxTokensSafe = Math.floor(maxInputTokens * 0.8);

  // count number of tokens
  let numTokens = 0;
  try {
    // Encode the message into tokens
    const encoder = encoding_for_model(model.modelId as TiktokenModel);
    
    try {
      const tokens = encoder.encode(markdown);
      numTokens = tokens.length;
    } catch (e) {
      throw e;
    } finally {
      // Free the encoder resources after use
      encoder.free();
    }
  } catch (error) {
    logger.warn("Calculating num tokens of string failed", { error });

    markdown = markdown.slice(0, maxTokensSafe * modifier);

    let w =
      "Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens (" +
      maxTokensSafe +
      ") we support.";
    warning = previousWarning === undefined ? w : w + " " + previousWarning;
  }

  if (numTokens > maxTokensSafe) {
    // trim the document to the maximum number of tokens, tokens != characters
    markdown = markdown.slice(0, maxTokensSafe * modifier);

    const w =
      "The extraction content would have used more tokens (" +
      numTokens +
      ") than the maximum we allow (" +
      maxTokensSafe +
      "). -- the input has been automatically trimmed.";
    warning = previousWarning === undefined ? w : w + " " + previousWarning;
  }

  let schema = options.schema;
  // Normalize the bad json schema users write (mogery)
  if (schema && !(schema instanceof z.ZodType)) {
    // let schema = options.schema;
    if (schema) {
      schema = removeDefaultProperty(schema);
    }

    if (schema && schema.type === "array") {
      schema = {
        type: "object",
        properties: {
          items: options.schema,
        },
        required: ["items"],
        additionalProperties: false,
      };
    } else if (schema && typeof schema === "object" && !schema.type) {
      schema = {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(schema).map(([key, value]) => {
            return [key, removeDefaultProperty(value)];
          }),
        ),
        required: Object.keys(schema),
        additionalProperties: false,
      };
    }

    schema = normalizeSchema(schema);
  }

  try {
    const prompt = options.prompt !== undefined
      ? `Transform the following content into structured JSON output based on the provided schema and this user request: ${options.prompt}. If schema is provided, strictly follow it.\n\n${markdown}`
      : `Transform the following content into structured JSON output based on the provided schema if any.\n\n${markdown}`;

    const repairConfig = {
      experimental_repairText: async ({ text, error }) => {
        const { text: fixedText } = await generateText({
          model: model,
          prompt: `Fix this JSON that had the following error: ${error}\n\nOriginal text:\n${text}\n\nReturn only the fixed JSON, no explanation.`,
          system: "You are a JSON repair expert. Your only job is to fix malformed JSON and return valid JSON that matches the original structure and intent as closely as possible. Do not include any explanation or commentary - only return the fixed JSON."
        });
        return fixedText;
      }
    };


    const generateObjectConfig = {
      model: model,
      prompt: prompt,
      temperature: options.temperature ?? 0,
      system: options.systemPrompt,
      ...(schema && { schema: schema instanceof z.ZodType ? schema : jsonSchema(schema) }),
      ...(!schema && { output: 'no-schema' as const }),
      ...repairConfig,
      ...(!schema && {
        onError: (error: Error) => {
          console.error(error);
        }
      })
    } satisfies Parameters<typeof generateObject>[0];

    const result = await generateObject(generateObjectConfig);
    extract = result.object;

    // If the users actually wants the items object, they can specify it as 'required' in the schema
    // otherwise, we just return the items array
    if (
      options.schema &&
      options.schema.type === "array" &&
      !schema?.required?.includes("items")
    ) {
      extract = extract?.items;
    }

    // Since generateObject doesn't provide token usage, we'll estimate it
    const promptTokens = numTokens;
    const completionTokens = result?.usage?.completionTokens ?? 0;

    return {
      extract,
      warning,
      numTokens,
      totalUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      model: model.modelId,
    };
  } catch (error) {
    if (error.message?.includes('refused')) {
      throw new LLMRefusalError(error.message);
    }
    throw error;
  }
}

export async function performLLMExtract(
  meta: Meta,
  document: Document,
): Promise<Document> {
  if (meta.options.formats.includes("extract")) {
    meta.internalOptions.abort?.throwIfAborted();
    const { extract, warning } = await generateCompletions({
      logger: meta.logger.child({
        method: "performLLMExtract/generateCompletions",
      }),
      options: meta.options.extract!,
      markdown: document.markdown,
      previousWarning: document.warning
    });

    if (meta.options.formats.includes("json")) {
      document.json = extract;
    } else {
      document.extract = extract;
    }
    document.warning = warning;
  }

  return document;
}

export function removeDefaultProperty(schema: any): any {
  if (typeof schema !== "object" || schema === null) return schema;

  const { default: _, ...rest } = schema;

  for (const key in rest) {
    if (Array.isArray(rest[key])) {
      rest[key] = rest[key].map((item: any) => removeDefaultProperty(item));
    } else if (typeof rest[key] === "object" && rest[key] !== null) {
      rest[key] = removeDefaultProperty(rest[key]);
    }
  }

  return rest;
}

export async function generateSchemaFromPrompt(prompt: string): Promise<any> {
  const model = getModel("gpt-4o");
  const temperatures = [0, 0.1, 0.3]; // Different temperatures to try
  let lastError: Error | null = null;

  for (const temp of temperatures) {
    try {
      const { extract } = await generateCompletions({
        logger: logger.child({
          method: "generateSchemaFromPrompt/generateCompletions",
        }),
        model: model,
        options: {
          mode: "llm",
          systemPrompt: `You are a schema generator for a web scraping system. Generate a JSON schema based on the user's prompt.
Consider:
1. The type of data being requested
2. Required fields vs optional fields
3. Appropriate data types for each field
4. Nested objects and arrays where appropriate

Valid JSON schema, has to be simple. No crazy properties. OpenAI has to support it.
Supported types
The following types are supported for Structured Outputs:

String
Number
Boolean
Integer
Object
Array
Enum
anyOf

Formats are not supported. Min/max are not supported. Anything beyond the above is not supported. Keep it simple with types and descriptions.
Optionals are not supported.
DO NOT USE FORMATS.
Keep it simple. Don't create too many properties, just the ones that are needed. Don't invent properties.
Return a valid JSON schema object with properties that would capture the information requested in the prompt.`,
          prompt: `Generate a JSON schema for extracting the following information: ${prompt}`,
          temperature: temp 
        },
        markdown: prompt
      });

      return extract;

    } catch (error) {
      lastError = error as Error;
      logger.warn(`Failed attempt with temperature ${temp}: ${error.message}`);
      continue;
    }
  }

  // If we get here, all attempts failed
  throw new Error(
    `Failed to generate schema after all attempts. Last error: ${lastError?.message}`,
  );
}
