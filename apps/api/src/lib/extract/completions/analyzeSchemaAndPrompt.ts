import {
  generateCompletions,
  generateSchemaFromPrompt,
} from "../../../scraper/scrapeURL/transformers/llmExtract";
import { TokenUsage } from "../../../controllers/v1/types";
import { z } from "zod";
import {
  buildAnalyzeSchemaPrompt,
  buildAnalyzeSchemaUserPrompt,
} from "../build-prompts";
import { jsonSchema } from "ai";
import { getModel } from "../../../lib/generic-ai";
import { Logger } from "winston";
import { CostTracking } from "../extraction-service";
export async function analyzeSchemaAndPrompt(
  urls: string[],
  schema: any,
  prompt: string,
  logger: Logger,
  costTracking: CostTracking,
): Promise<{
  isMultiEntity: boolean;
  multiEntityKeys: string[];
  reasoning: string;
  keyIndicators: string[];
  tokenUsage: TokenUsage;
}> {
  if (!schema) {
    const genRes = await generateSchemaFromPrompt(prompt, logger, costTracking);
    schema = genRes.extract;
  }

  const schemaString = JSON.stringify(schema);

  const model = getModel("gpt-4o", "openai");

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

  try {
    const { extract: result, totalUsage } = await generateCompletions({
      logger,
      options: {
        mode: "llm",
        schema: checkSchema,
        prompt: buildAnalyzeSchemaUserPrompt(schemaString, prompt, urls),
        systemPrompt: buildAnalyzeSchemaPrompt(),
      },
      markdown: "",
      model,
      costTrackingOptions: {
        costTracking,
        metadata: {
          module: "extract",
          method: "analyzeSchemaAndPrompt",
        },
      },
    });

    const { isMultiEntity, multiEntityKeys, reasoning, keyIndicators } =
      checkSchema.parse(result);

    return {
      isMultiEntity,
      multiEntityKeys,
      reasoning,
      keyIndicators,
      tokenUsage: totalUsage,
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
