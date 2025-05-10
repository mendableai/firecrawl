import { TokenUsage } from "../../../../controllers/v1/types";
import { z } from "zod";
import {
  buildAnalyzeSchemaPrompt,
  buildAnalyzeSchemaUserPrompt,
} from "../../build-prompts";
import { logger } from "../../../logger";
import { jsonSchema } from "ai";
import { getModel } from "../../../generic-ai";
import {
  generateCompletions_F0,
  generateSchemaFromPrompt_F0,
} from "../llmExtract-f0";

export async function analyzeSchemaAndPrompt_F0(
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
    schema = await generateSchemaFromPrompt_F0(prompt);
  }

  const schemaString = JSON.stringify(schema);

  const model = getModel("gpt-4o");

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
    // Debug log: Generate a cURL request for the schema analysis
    const schemaAnalysisPrompt = buildAnalyzeSchemaUserPrompt(schemaString, prompt, urls);
    const systemPrompt = buildAnalyzeSchemaPrompt();
    
    // Use console.log for better visibility in the logs
    console.log('=================================================================');
    console.log(`✨ SCHEMA ANALYSIS REQUEST - Model: ${model.modelId}`);
    console.log('=================================================================');
    console.log('Schema:', schemaString.substring(0, 300) + (schemaString.length > 300 ? '...' : ''));
    console.log('Prompt:', prompt.substring(0, 300) + (prompt.length > 300 ? '...' : ''));
    console.log('URLs:', urls);
    console.log('System prompt:', systemPrompt.substring(0, 300) + (systemPrompt.length > 300 ? '...' : ''));
    console.log('=================================================================');
    
    // Also log to standard logger
    logger.info("Schema Analysis Request", { 
      module: "extract", 
      method: "analyzeSchemaAndPrompt",
      modelId: model.modelId,
      promptLength: prompt.length,
      schemaLength: schemaString.length,
      urlCount: urls.length
    });
    
    // First try with the provided model
    let extract, totalUsage;
    try {
      const result = await generateCompletions_F0({
        logger,
        options: {
          mode: "llm",
          schema: checkSchema,
          prompt: schemaAnalysisPrompt,
          systemPrompt: systemPrompt,
        },
        markdown: "",
        model,
      });
      
      extract = result.extract;
      totalUsage = result.totalUsage;
    } catch (error) {
      logger.error("Schema analysis failed with primary model", {
        module: "extract",
        method: "analyzeSchemaAndPrompt",
        model: model.modelId,
        error: error.message
      });
      
      // If the primary model fails and it's a Meta model, try with GPT as a fallback
      if (model.modelId.includes('llama') || model.modelId.includes('meta')) {
        logger.info("Attempting schema analysis with fallback OpenAI model", {
          module: "extract",
          method: "analyzeSchemaAndPrompt",
          originalModel: model.modelId,
          fallbackModel: "gpt-4o"
        });
        
        try {
          const fallbackModel = getModel("gpt-4o");
          const fallbackResult = await generateCompletions_F0({
            logger,
            options: {
              mode: "llm",
              schema: checkSchema,
              prompt: schemaAnalysisPrompt,
              systemPrompt: systemPrompt,
            },
            markdown: "",
            model: fallbackModel,
          });
          
          extract = fallbackResult.extract;
          totalUsage = fallbackResult.totalUsage;
          
          logger.info("Fallback model succeeded for schema analysis", {
            module: "extract",
            method: "analyzeSchemaAndPrompt",
            fallbackModel: "gpt-4o"
          });
        } catch (fallbackError) {
          logger.error("Fallback model also failed for schema analysis", {
            module: "extract",
            method: "analyzeSchemaAndPrompt",
            originalModel: model.modelId,
            fallbackError: fallbackError.message
          });
          throw error; // Re-throw the original error if fallback also fails
        }
      } else {
        throw error; // Re-throw if not using a Meta model
      }
    }

    // Handle case where extract might be null or undefined
    if (!extract) {
      logger.warn("(analyzeSchemaAndPrompt) No result returned from AI", {
        model: model.modelId,
        prompt,
      });
      return {
        isMultiEntity: false,
        multiEntityKeys: [],
        reasoning: "AI did not return a structured result",
        keyIndicators: [],
        tokenUsage: totalUsage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          model: model.modelId,
        },
      };
    }

    const { isMultiEntity, multiEntityKeys, reasoning, keyIndicators } =
      checkSchema.parse(extract);

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
