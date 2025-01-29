import OpenAI from "openai";
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

export async function generateOpenAICompletions(
  logger: Logger,
  options: ExtractOptions,
  markdown?: string,
  previousWarning?: string,
  isExtractEndpoint?: boolean,
  model: TiktokenModel = (process.env.MODEL_NAME as TiktokenModel) ??
    "gpt-4o-mini",
): Promise<{
  extract: any;
  numTokens: number;
  warning: string | undefined;
  totalUsage: TokenUsage;
  model: string;
}> {
  let extract: any;
  let warning: string | undefined;

  const openai = new OpenAI();

  if (markdown === undefined) {
    throw new Error("document.markdown is undefined -- this is unexpected");
  }

  const { maxInputTokens, maxOutputTokens } = getModelLimits(model);

  // Ratio of 4 was way too high, now 3.5.
  const modifier = 3.5; // tokens to characters ratio
  // Calculate 80% of max input tokens (for content)
  const maxTokensSafe = Math.floor(maxInputTokens * 0.8);

  // count number of tokens
  let numTokens = 0;
  const encoder = encoding_for_model(model as TiktokenModel);
  try {
    // Encode the message into tokens
    const tokens = encoder.encode(markdown);

    // Return the number of tokens
    numTokens = tokens.length;
  } catch (error) {
    logger.warn("Calculating num tokens of string failed", { error, markdown });

    markdown = markdown.slice(0, maxTokensSafe * modifier);

    let w =
      "Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens (" +
      maxTokensSafe +
      ") we support.";
    warning = previousWarning === undefined ? w : w + " " + previousWarning;
  } finally {
    // Free the encoder resources after use
    encoder.free();
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

  const jsonCompletion = await openai.beta.chat.completions.parse({
    model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: options.systemPrompt,
      },
      {
        role: "user",
        content: [{ type: "text", text: markdown }],
      },
      {
        role: "user",
        content:
          options.prompt !== undefined
            ? `Transform the above content into structured JSON output based on the provided schema if any and the following user request: ${options.prompt}. If schema is provided, strictly follow it.`
            : "Transform the above content into structured JSON output based on the provided schema if any.",
      },
    ],
    response_format: options.schema
      ? {
          type: "json_schema",
          json_schema: {
            name: "schema",
            schema: schema,
            strict: true,
          },
        }
      : { type: "json_object" },
  });

  if (jsonCompletion.choices[0].message.refusal !== null) {
    throw new LLMRefusalError(jsonCompletion.choices[0].message.refusal);
  }

  extract = jsonCompletion.choices[0].message.parsed;

  if (extract === null && jsonCompletion.choices[0].message.content !== null) {
    try {
      if (!isExtractEndpoint) {
        extract = JSON.parse(jsonCompletion.choices[0].message.content);
      } else {
        const extractData = JSON.parse(
          jsonCompletion.choices[0].message.content,
        );
        extract = options.schema ? extractData.data.extract : extractData;
      }
    } catch (e) {
      logger.error("Failed to parse returned JSON, no schema specified.", {
        error: e,
      });
      throw new LLMRefusalError(
        "Failed to parse returned JSON. Please specify a schema in the extract object.",
      );
    }
  }

  const promptTokens = jsonCompletion.usage?.prompt_tokens ?? 0;
  const completionTokens = jsonCompletion.usage?.completion_tokens ?? 0;

  // If the users actually wants the items object, they can specify it as 'required' in the schema
  // otherwise, we just return the items array
  if (
    options.schema &&
    options.schema.type === "array" &&
    !schema?.required?.includes("items")
  ) {
    extract = extract?.items;
  }
  // num tokens (just user prompt tokenized) | deprecated
  // totalTokens = promptTokens + completionTokens
  return {
    extract,
    warning,
    numTokens,
    totalUsage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    model,
  };
}

export async function performLLMExtract(
  meta: Meta,
  document: Document,
): Promise<Document> {
  if (meta.options.formats.includes("extract")) {
    const { extract, warning } = await generateOpenAICompletions(
      meta.logger.child({
        method: "performLLMExtract/generateOpenAICompletions",
      }),
      meta.options.extract!,
      document.markdown,
      document.warning,
    );

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
  const openai = new OpenAI();

  const temperatures = [0, 0.1, 0.3]; // Different temperatures to try
  let lastError: Error | null = null;

  for (const temp of temperatures) {
    try {
      const result = await openai.beta.chat.completions.parse({
        model: "gpt-4o",
        temperature: temp,
        messages: [
          {
            role: "system",
            content: `You are a schema generator for a web scraping system. Generate a JSON schema based on the user's prompt.
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
          },
          {
            role: "user",
            content: `Generate a JSON schema for extracting the following information: ${prompt}`,
          },
        ],
        response_format: {
          type: "json_object",
        },
      });

      if (result.choices[0].message.refusal !== null) {
        throw new Error("LLM refused to generate schema");
      }

      let schema;
      try {
        schema = JSON.parse(result.choices[0].message.content ?? "");
        return schema;
      } catch (e) {
        throw new Error("Failed to parse schema JSON from LLM response");
      }
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
