import { encoding_for_model } from "@dqbd/tiktoken";
import { TiktokenModel } from "@dqbd/tiktoken";
import {
  Document,
  ExtractOptions,
  isAgentExtractModelValid,
  TokenUsage,
} from "../../../controllers/v1/types";
import { Logger } from "winston";
import { EngineResultsTracker, Meta } from "..";
import { logger } from "../../../lib/logger";
import { modelPrices } from "../../../lib/extract/usage/model-prices";
import {
  AISDKError,
  generateObject,
  generateText,
  LanguageModel,
  NoObjectGeneratedError,
} from "ai";
import { jsonSchema } from "ai";
import { getModel } from "../../../lib/generic-ai";
import { z } from "zod";
import fs from "fs/promises";
import Ajv from "ajv";
import { extractData } from "../lib/extractSmartScrape";
import { CostTracking } from "../../../lib/extract/extraction-service";
// TODO: fix this, it's horrible
type LanguageModelV1ProviderMetadata = {
  anthropic?: {
    thinking?: {
      type: "enabled" | "disabled";
      budgetTokens?: number;
    };
    tool_choice?: "auto" | "none" | "required";
  };
};

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
        Object.entries(x.properties || {}).map(([k, v]) => [
          k,
          normalizeSchema(v),
        ]),
      ),
      required: Object.keys(x.properties || {}),
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

interface TrimResult {
  text: string;
  numTokens: number;
  warning?: string;
}

export function trimToTokenLimit(
  text: string,
  maxTokens: number,
  modelId: string = "gpt-4o",
  previousWarning?: string,
): TrimResult {
  try {
    const encoder = encoding_for_model(modelId as TiktokenModel);
    try {
      const tokens = encoder.encode(text);
      const numTokens = tokens.length;

      if (numTokens <= maxTokens) {
        return { text, numTokens };
      }

      const modifier = 3;
      // Start with 3 chars per token estimation
      let currentText = text.slice(0, Math.floor(maxTokens * modifier) - 1);

      // Keep trimming until we're under the token limit
      while (true) {
        const currentTokens = encoder.encode(currentText);
        if (currentTokens.length <= maxTokens) {
          const warning = `The extraction content would have used more tokens (${numTokens}) than the maximum we allow (${maxTokens}). -- the input has been automatically trimmed.`;
          return {
            text: currentText,
            numTokens: currentTokens.length,
            warning: previousWarning
              ? `${warning} ${previousWarning}`
              : warning,
          };
        }
        const overflow = currentTokens.length * modifier - maxTokens - 1;
        // If still over limit, remove another chunk
        currentText = currentText.slice(
          0,
          Math.floor(currentText.length - overflow),
        );
      }
    } catch (e) {
      throw e;
    } finally {
      encoder.free();
    }
  } catch (error) {
    // Fallback to a more conservative character-based approach
    const estimatedCharsPerToken = 2.8;
    const safeLength = maxTokens * estimatedCharsPerToken;
    const trimmedText = text.slice(0, Math.floor(safeLength));

    const warning = `Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens (${maxTokens}) we support.`;

    return {
      text: trimmedText,
      numTokens: maxTokens, // We assume we hit the max in this fallback case
      warning: previousWarning ? `${warning} ${previousWarning}` : warning,
    };
  }
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
) {
  const modelCosts = {
    "openai/o3-mini": { input_cost: 1.1, output_cost: 4.4 },
    "gpt-4o-mini": { input_cost: 0.15, output_cost: 0.6 },
    "openai/gpt-4o-mini": { input_cost: 0.15, output_cost: 0.6 },
    "openai/gpt-4o": { input_cost: 2.5, output_cost: 10 },
    "google/gemini-2.0-flash-001": { input_cost: 0.15, output_cost: 0.6 },
    "gemini-2.0-flash": { input_cost: 0.15, output_cost: 0.6 },
    "deepseek/deepseek-r1": { input_cost: 0.55, output_cost: 2.19 },
    "google/gemini-2.0-flash-thinking-exp:free": {
      input_cost: 0.55,
      output_cost: 2.19,
    },
  };
  let modelCost = modelCosts[model] || { input_cost: 0, output_cost: 0 };
  //gemini-2.5-pro-exp-03-25 pricing
  if (
    model.includes("gemini-2.5-pro")
  ) {
    let inputCost = 0;
    let outputCost = 0;
    if (inputTokens <= 200000) {
      inputCost = 1.25;
      outputCost = 10.0;
    } else {
      inputCost = 2.5;
      outputCost = 15.0;
    }
    modelCost = { input_cost: inputCost, output_cost: outputCost };
  }
  const totalCost =
    (inputTokens * modelCost.input_cost +
      outputTokens * modelCost.output_cost) /
    1_000_000;

  return totalCost;
}

export type GenerateCompletionsOptions = {
  model?: LanguageModel;
  logger: Logger;
  options: ExtractOptions;
  markdown?: string;
  previousWarning?: string;
  isExtractEndpoint?: boolean;
  mode?: "object" | "no-object";
  providerOptions?: LanguageModelV1ProviderMetadata;
  retryModel?: LanguageModel;
  costTrackingOptions: {
    costTracking: CostTracking;
    metadata: Record<string, any>;
  };
};
export async function generateCompletions({
  logger,
  options,
  markdown,
  previousWarning,
  isExtractEndpoint,
  model = getModel("gpt-4o-mini", "openai"),
  mode = "object",
  providerOptions,
  retryModel = getModel("claude-3-5-sonnet-20240620", "anthropic"),
  costTrackingOptions,
}: GenerateCompletionsOptions): Promise<{
  extract: any;
  numTokens: number;
  warning: string | undefined;
  totalUsage: TokenUsage;
  model: string;
}> {
  let extract: any;
  let warning: string | undefined;
  let currentModel = model;
  let lastError: Error | null = null;

  if (markdown === undefined) {
    throw new Error("document.markdown is undefined -- this is unexpected");
  }

  try {
    const prompt =
      options.prompt !== undefined
        ? `Transform the following content into structured JSON output based on the provided schema and this user request: ${options.prompt}. If schema is provided, strictly follow it.\n\n${markdown}`
        : `Transform the following content into structured JSON output based on the provided schema if any.\n\n${markdown}`;

    if (mode === "no-object") {
      try {
        const result = await generateText({
          model: currentModel,
          prompt: options.prompt + (markdown ? `\n\nData:${markdown}` : ""),
          system: options.systemPrompt,
          providerOptions: {
            anthropic: {
              thinking: { type: "enabled", budgetTokens: 12000 },
            },
          },
        });

        costTrackingOptions.costTracking.addCall({
          type: "other",
          metadata: {
            ...costTrackingOptions.metadata,
            gcDetails: "no-object",
          },
          model: currentModel.modelId,
          cost: calculateCost(
            currentModel.modelId,
            result.usage?.promptTokens ?? 0,
            result.usage?.completionTokens ?? 0,
          ),
          tokens: {
            input: result.usage?.promptTokens ?? 0,
            output: result.usage?.completionTokens ?? 0,
          }
        });

        extract = result.text;

        return {
          extract,
          warning,
          numTokens: result.usage?.promptTokens ?? 0,
          totalUsage: {
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0,
            totalTokens: result.usage?.promptTokens ?? 0 + (result.usage?.completionTokens ?? 0),
          },
          model: currentModel.modelId,
        };
      } catch (error) {
        lastError = error as Error;
        if (
          error.message?.includes("Quota exceeded") ||
          error.message?.includes("You exceeded your current quota") ||
          error.message?.includes("rate limit")
        ) {
          logger.warn("Quota exceeded, retrying with fallback model", {
            error: lastError.message,
          });
          currentModel = retryModel;
          try {
            const result = await generateText({
              model: currentModel,
              prompt: options.prompt + (markdown ? `\n\nData:${markdown}` : ""),
              system: options.systemPrompt,
              providerOptions: {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 12000 },
                },
              },
            });

            extract = result.text;

            costTrackingOptions.costTracking.addCall({
              type: "other",
              metadata: {
                ...costTrackingOptions.metadata,
                gcDetails: "no-object fallback",
              },
              model: currentModel.modelId,
              cost: calculateCost(
                currentModel.modelId,
                result.usage?.promptTokens ?? 0,
                result.usage?.completionTokens ?? 0,
              ),
              tokens: {
                input: result.usage?.promptTokens ?? 0,
                output: result.usage?.completionTokens ?? 0,
              }
            });

            return {
              extract,
              warning,
              numTokens: result.usage?.promptTokens ?? 0,
              totalUsage: {
                promptTokens: result.usage?.promptTokens ?? 0,
                completionTokens: result.usage?.completionTokens ?? 0,
                totalTokens: result.usage?.promptTokens ?? 0 + (result.usage?.completionTokens ?? 0),
              },
              model: currentModel.modelId,
            };
          } catch (retryError) {
            lastError = retryError as Error;
            logger.error("Failed with fallback model", {
              originalError: lastError.message,
              model: currentModel.modelId,
            });
            throw lastError;
          }
        }
        throw lastError;
      }
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

    const repairConfig = {
      experimental_repairText: async ({ text, error }) => {
        // AI may output a markdown JSON code block. Remove it - mogery
        logger.debug("Repairing text", { textType: typeof text, textPeek: JSON.stringify(text).slice(0, 100) + "...", error });

        if (typeof text === "string" && text.trim().startsWith("```")) {
          if (text.trim().startsWith("```json")) {
            text = text.trim().slice("```json".length).trim();
          } else {
            text = text.trim().slice("```".length).trim();
          }

          if (text.trim().endsWith("```")) {
            text = text.trim().slice(0, -"```".length).trim();
          }

          // If this fixes the JSON, just return it. If not, continue - mogery
          try {
            JSON.parse(text);
            logger.debug("Repaired text with string manipulation");
            return text;
          } catch (e) {
            logger.error("Even after repairing, failed to parse JSON", { error: e });
          }
        }

        try {
          const { text: fixedText, usage: repairUsage } = await generateText({
            model: currentModel,
            prompt: `Fix this JSON that had the following error: ${error}\n\nOriginal text:\n${text}\n\nReturn only the fixed JSON, no explanation.`,
            system:
              "You are a JSON repair expert. Your only job is to fix malformed JSON and return valid JSON that matches the original structure and intent as closely as possible. Do not include any explanation or commentary - only return the fixed JSON. Do not return it in a Markdown code block, just plain JSON.",
            providerOptions: {
              anthropic: {
                thinking: { type: "enabled", budgetTokens: 12000 },
              },
            },
          });

          costTrackingOptions.costTracking.addCall({
            type: "other",
            metadata: {
              ...costTrackingOptions.metadata,
              gcDetails: "repairConfig",
            },
            cost: calculateCost(
              currentModel.modelId,
              repairUsage?.promptTokens ?? 0,
              repairUsage?.completionTokens ?? 0,
            ),
            model: currentModel.modelId,
            tokens: {
              input: repairUsage?.promptTokens ?? 0,
              output: repairUsage?.completionTokens ?? 0,
            },
          });
          logger.debug("Repaired text with LLM");
          return fixedText;
        } catch (repairError) {
          lastError = repairError as Error;
          logger.error("Failed to repair JSON", { error: lastError.message });
          throw lastError;
        }
      },
    };

    const generateObjectConfig = {
      model: currentModel,
      prompt: prompt,
      providerOptions: providerOptions || undefined,
      system: options.systemPrompt,
      ...(schema && {
        schema: schema instanceof z.ZodType ? schema : jsonSchema(schema),
      }),
      ...(!schema && { output: "no-schema" as const }),
      ...repairConfig,
      ...(!schema && {
        onError: (error: Error) => {
          lastError = error;
          console.error(error);
        },
      }),
    } satisfies Parameters<typeof generateObject>[0];

    // const now = new Date().getTime();
    // await fs.writeFile(
    //   `logs/generateObjectConfig-${now}.json`,
    //   JSON.stringify(generateObjectConfig, null, 2),
    // );

    logger.debug("Generating object...", { generateObjectConfig: {
      ...generateObjectConfig,
      prompt: generateObjectConfig.prompt.slice(0, 100) + "...",
      system: generateObjectConfig.system?.slice(0, 100) + "...",
    }, model, retryModel });

    let result: { object: any; usage: TokenUsage } | undefined;
    try {
      result = await generateObject(generateObjectConfig);
      costTrackingOptions.costTracking.addCall({
        type: "other",
        metadata: {
          ...costTrackingOptions.metadata,
          gcDetails: "generateObject",
          gcModel: generateObjectConfig.model.modelId,
        },
        tokens: {
          input: result.usage?.promptTokens ?? 0,
          output: result.usage?.completionTokens ?? 0,
        },
        model: currentModel.modelId,
        cost: calculateCost(
          currentModel.modelId,
          result.usage?.promptTokens ?? 0,
          result.usage?.completionTokens ?? 0,
        ),
      });
    } catch (error) {
      lastError = error as Error;
      if (
        error.message?.includes("Quota exceeded") ||
        error.message?.includes("You exceeded your current quota") ||
        error.message?.includes("rate limit")
      ) {
        logger.warn("Quota exceeded, retrying with fallback model", {
          error: lastError.message,
        });
        currentModel = retryModel;
        try {
          const retryConfig = {
            ...generateObjectConfig,
            model: currentModel,
          };
          result = await generateObject(retryConfig);
          costTrackingOptions.costTracking.addCall({
            type: "other",
            metadata: {
              ...costTrackingOptions.metadata,
              gcDetails: "generateObject fallback",
              gcModel: retryConfig.model.modelId,
            },
            tokens: {
              input: result.usage?.promptTokens ?? 0,
              output: result.usage?.completionTokens ?? 0,
            },
            model: currentModel.modelId,
            cost: calculateCost(
              currentModel.modelId,
              result.usage?.promptTokens ?? 0,
              result.usage?.completionTokens ?? 0,
            ),
          });
        } catch (retryError) {
          lastError = retryError as Error;
          logger.error("Failed with fallback model", {
            originalError: lastError.message,
            model: currentModel.modelId,
          });
          throw lastError;
        }
      } else if (NoObjectGeneratedError.isInstance(error)) {
        console.log("No object generated", error);
        if (
          error.text &&
          error.text.startsWith("```json") &&
          error?.text.endsWith("```")
        ) {
          try {
            extract = JSON.parse(
              error.text.slice("```json".length, -"```".length).trim(),
            );
            result = {
              object: extract,
              usage: {
                promptTokens: error.usage?.promptTokens ?? 0,
                completionTokens: error.usage?.completionTokens ?? 0,
                totalTokens: error.usage?.totalTokens ?? 0,
              },
            };
          } catch (parseError) {
            lastError = parseError as Error;
            logger.error("Failed to parse JSON from error text", {
              error: lastError.message,
            });
            throw lastError;
          }
        } else {
          throw lastError;
        }
      } else {
        throw lastError;
      }
    }

    extract = result?.object;

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
    const promptTokens = result.usage?.promptTokens ?? 0;
    const completionTokens = result.usage?.completionTokens ?? 0;

    return {
      extract,
      warning,
      numTokens: promptTokens,
      totalUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      model: currentModel.modelId,
    };
  } catch (error) {
    lastError = error as Error;
    if (error.message?.includes("refused")) {
      throw new LLMRefusalError(error.message);
    }
    logger.error("LLM extraction failed", {
      error: lastError,
      model: currentModel.modelId,
      mode,
    });
    throw lastError;
  }
}

export async function performLLMExtract(
  meta: Meta,
  document: Document,
): Promise<Document> {
  if (meta.options.formats.includes("extract")) {
    if (meta.internalOptions.zeroDataRetention) {
      document.warning = "JSON mode is not supported with zero data retention." + (document.warning ? " " + document.warning : "")
      return document;
    }

    // const originalOptions = meta.options.extract!;

    // let generationOptions = { ...originalOptions }; // Start with original options

    const generationOptions: GenerateCompletionsOptions = {
      logger: meta.logger.child({
        method: "performLLMExtract/generateCompletions",
      }),
      options: meta.options.extract!,
      markdown: document.markdown,
      previousWarning: document.warning,
      // ... existing model and provider options ...
      // model: getModel("o3-mini", "openai"), // Keeping existing model selection
      // model: getModel("o3-mini", "openai"),
      // model: getModel("qwen-qwq-32b", "groq"),
      // model: getModel("gemini-2.0-flash", "google"),
      // model: getModel("gemini-2.5-pro-preview-03-25", "vertex"),
      model: getModel("gpt-4o-mini", "openai"),
      retryModel: getModel("gpt-4o", "openai"),
      costTrackingOptions: {
        costTracking: meta.costTracking,
        metadata: {
          module: "scrapeURL",
          method: "performLLMExtract",
        },
      },
    };

    const { extractedDataArray, warning, costLimitExceededTokenUsage } =
      await extractData({
        extractOptions: generationOptions,
        urls: [meta.rewrittenUrl ?? meta.url],
        useAgent: false,
        scrapeId: meta.id,
      });

    if (warning) {
      document.warning = warning + (document.warning ? " " + document.warning : "");
    }

    // IMPORTANT: here it only get's the last page!!!
    const extractedData =
      extractedDataArray[extractedDataArray.length - 1] ?? undefined;

    // // Prepare the schema, potentially wrapping it
    // const { schemaToUse, schemaWasWrapped } = prepareSmartScrapeSchema(
    //   originalOptions.schema,
    //   meta.logger,
    // );

    // // Update generationOptions with the potentially wrapped schema
    // generationOptions.schema = schemaToUse;

    // meta.internalOptions.abort?.throwIfAborted();
    // const {
    //   extract: rawExtract,
    //   warning,
    //   totalUsage,
    //   model,
    // } = await generateCompletions({
    //   logger: meta.logger.child({
    //     method: "performLLMExtract/generateCompletions",
    //   }),
    //   options: generationOptions, // Use the potentially modified options
    //   markdown: document.markdown,
    //   previousWarning: document.warning,
    //   // ... existing model and provider options ...
    //   model: getModel("o3-mini", "openai"), // Keeping existing model selection
    //   providerOptions: {
    //     anthropic: {
    //       thinking: { type: "enabled", budgetTokens: 12000 },
    //     },
    //   },
    // });

    // // Log token usage
    // meta.logger.info("LLM extraction token usage", {
    //   model: model,
    //   promptTokens: totalUsage.promptTokens,
    //   completionTokens: totalUsage.completionTokens,
    //   totalTokens: totalUsage.totalTokens,
    // });

    // // Process the result to extract data and SmartScrape decision
    // const {
    //   extractedData,
    //   shouldUseSmartscrape,
    //   smartscrape_reasoning,
    //   smartscrape_prompt,
    // } = processSmartScrapeResult(rawExtract, schemaWasWrapped, meta.logger);

    // // Log the SmartScrape decision if applicable
    // if (schemaWasWrapped) {
    //   meta.logger.info("SmartScrape decision processing result", {
    //     shouldUseSmartscrape,
    //     smartscrape_reasoning,
    //     // Don't log the full prompt potentially
    //     smartscrape_prompt_present: !!smartscrape_prompt,
    //     extractedDataIsPresent:
    //       extractedData !== undefined && extractedData !== null,
    //   });

    //   // TODO: Implement logic to ACTUALLY trigger SmartScrape based on the result
    //   // For example:
    //   // if (shouldUseSmartscrape && smartscrape_prompt) {
    //   //   meta.logger.info("Triggering SmartScrape refinement...", { reason: smartscrape_reasoning, prompt: smartscrape_prompt });
    //   //   // Call the smartScrape function (which needs to be implemented/imported)
    //   //   // const smartScrapedDocs = await smartScrape(meta.rewrittenUrl ?? meta.url, smartscrape_prompt);
    //   //   // Process/merge smartScrapedDocs with extractedData
    //   //   // ... potentially update finalExtract ...
    //   // } else {
    //   //   meta.logger.info("SmartScrape not required based on LLM output.");
    //   // }
    // }

    // Assign the final extracted data
    if (meta.options.formats.includes("json")) {
      document.json = extractedData;
    } else {
      document.extract = extractedData;
    }
    // document.warning = warning;
  }

  return document;
}

export function removeDefaultProperty(schema: any): any {
  if (typeof schema !== "object" || schema === null) return schema;

  const rest = { ...schema };

  // unsupported global keys
  delete rest.default;

  // unsupported object keys
  delete rest.patternProperties;
  delete rest.unevaluatedProperties;
  delete rest.propertyNames;
  delete rest.minProperties;
  delete rest.maxProperties;

  // unsupported string keys
  delete rest.minLength;
  delete rest.maxLength;
  delete rest.pattern;
  delete rest.format;

  // unsupported number keys
  delete rest.minimum;
  delete rest.maximum;
  delete rest.multipleOf;

  // unsupported array keys
  delete rest.unevaluatedItems;
  delete rest.contains;
  delete rest.minContains;
  delete rest.maxContains;
  delete rest.minItems;
  delete rest.maxItems;
  delete rest.uniqueItems;

  for (const key in rest) {
    if (Array.isArray(rest[key])) {
      rest[key] = rest[key].map((item: any) => removeDefaultProperty(item));
    } else if (typeof rest[key] === "object" && rest[key] !== null) {
      rest[key] = removeDefaultProperty(rest[key]);
    }
  }

  return rest;
}

export async function generateSchemaFromPrompt(
  prompt: string,
  logger: Logger,
  costTracking: CostTracking,
): Promise<{ extract: any }> {
  const model = getModel("gpt-4o", "openai");
  const retryModel = getModel("gpt-4o-mini", "openai");
  const temperatures = [0, 0.1, 0.3]; // Different temperatures to try
  let lastError: Error | null = null;

  for (const temp of temperatures) {
    try {
      const { extract } = await generateCompletions({
        logger: logger.child({
          method: "generateSchemaFromPrompt/generateCompletions",
        }),
        model,
        retryModel,
        markdown: "",
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
          // temperature: temp,
        },
        costTrackingOptions: {
          costTracking,
          metadata: {
            module: "scrapeURL",
            method: "generateSchemaFromPrompt",
          },
        },
      });

      return { extract };
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
