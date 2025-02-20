import { generateSchemaFromPrompt } from "../../../scraper/scrapeURL/transformers/llmExtract";
import { TokenUsage } from "../../../controllers/v1/types";
import { z } from "zod";
import {
  buildAnalyzeSchemaPrompt,
  buildAnalyzeSchemaUserPrompt,
} from "../build-prompts";
import { logger } from "../../../lib/logger";
import { generateObject, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";

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

  const model = process.env.MODEL_NAME ? openai(process.env.MODEL_NAME) : openai("gpt-4o");

  const checkSchema = z.object({
    isMultiEntity: z.boolean(),
    multiEntityKeys: z.array(z.string()).optional().default([]),
    reasoning: z.string(),
    keyIndicators: z.array(z.string()),
  }).refine(
    (x) => !x.isMultiEntity || x.multiEntityKeys.length > 0,
    "isMultiEntity was true, but no multiEntityKeys",
  );


  try {
    const result = await generateObject({
      model,
      prompt: buildAnalyzeSchemaUserPrompt(schemaString, prompt, urls),
      system: buildAnalyzeSchemaPrompt(),
      schema: checkSchema,
      onError: (error: Error) => {
        console.error(error);
      }
    });
    const { isMultiEntity, multiEntityKeys, reasoning, keyIndicators } = checkSchema.parse(result.object);

    return {
      isMultiEntity,
      multiEntityKeys,
      reasoning,
      keyIndicators,
      tokenUsage: {
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        totalTokens: (result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0),
        model: model.modelId,
      },
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
    tokenUsage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: model.modelId,
    },
  };
}
