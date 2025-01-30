import { generateSchemaFromPrompt } from "../../../scraper/scrapeURL/transformers/llmExtract";
import { TokenUsage } from "../../../controllers/v1/types";
import { z } from "zod";
import {
  buildAnalyzeSchemaPrompt,
  buildAnalyzeSchemaUserPrompt,
} from "../build-prompts";
import OpenAI from "openai";
import { logger } from "../../../lib/logger";
const openai = new OpenAI();

export async function analyzeSchemaAndPrompt(
  urls: string[],
  schema: any,
  prompt: string,
): Promise<{
  isMultiEntity: boolean;
  multiEntityKeys: string[];
  reasoning?: string;
  keyIndicators?: string[];
  tokenUsage: TokenUsage;
}> {
  if (!schema) {
    schema = await generateSchemaFromPrompt(prompt);
  }

  const schemaString = JSON.stringify(schema);

  const checkSchema = z
    .object({
      isMultiEntity: z.boolean(),
      multiEntityKeys: z.array(z.string()).optional().default([]),
      reasoning: z.string(),
      keyIndicators: z.array(z.string()),
    })
    .refine(
      (x) => !x.isMultiEntity || x.multiEntityKeys.length > 0,
      "isMultiEntity was true, but no multiEntityKeys",
    );

  const model = "gpt-4o";

  const result = await openai.beta.chat.completions.parse({
    model: model,
    messages: [
      {
        role: "system",
        content: buildAnalyzeSchemaPrompt(),
      },
      {
        role: "user",
        content: buildAnalyzeSchemaUserPrompt(schemaString, prompt, urls),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: {
          type: "object",
          properties: {
            isMultiEntity: { type: "boolean" },
            multiEntityKeys: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
            keyIndicators: { type: "array", items: { type: "string" } },
          },
          required: [
            "isMultiEntity",
            "multiEntityKeys",
            "reasoning",
            "keyIndicators",
          ],
          additionalProperties: false,
        },
        name: "checkSchema",
      },
    },
  });

  const tokenUsage: TokenUsage = {
    promptTokens: result.usage?.prompt_tokens ?? 0,
    completionTokens: result.usage?.completion_tokens ?? 0,
    totalTokens: result.usage?.total_tokens ?? 0,
    model: model,
  };

  try {
    const { isMultiEntity, multiEntityKeys, reasoning, keyIndicators } =
      checkSchema.parse(result.choices[0].message.parsed);
    return {
      isMultiEntity,
      multiEntityKeys,
      reasoning,
      keyIndicators,
      tokenUsage,
    };
  } catch (e) {
    logger.warn("(analyzeSchemaAndPrompt) Error parsing schema analysis", {
      error: e,
    });
  }

  return {
    isMultiEntity: false,
    multiEntityKeys: [],
    reasoning: "",
    keyIndicators: [],
    tokenUsage,
  };
}
