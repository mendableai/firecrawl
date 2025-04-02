import { TokenUsage } from "../../../controllers/v1/types";
import { logger } from "../../../lib/logger";
import { modelPrices } from "./model-prices";
import { modelPrices as modelPricesV2 } from "./model-prices-2";

interface ModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  input_cost_per_request?: number;
  mode: string;
}

interface ModelPricingV2 {
  input_cost_per_million_tokens: number;
  output_cost_per_million_tokens: number;
}

const tokenPerCharacter = 4;
const baseTokenCost = 300;

export function calculateFinalResultCost(data: any): number {
  return Math.floor(
    JSON.stringify(data).length / tokenPerCharacter + baseTokenCost,
  );
}

export function estimateTotalCost(tokenUsage: TokenUsage[]): number {
  return tokenUsage.reduce((total, usage) => {
    return total + estimateCost(usage);
  }, 0);
}

export function estimateCost(tokenUsage: TokenUsage): number {
  let totalCost = 0;
  try {
    let model = tokenUsage.model ?? (process.env.MODEL_NAME || "gpt-4o-mini");
    const pricing = modelPrices[model] as ModelPricing;

    if (!pricing) {
      logger.error(`No pricing information found for model: ${model}`);
      return 0;
    }

    if (pricing.mode !== "chat") {
      logger.error(`Model ${model} is not a chat model`);
      return 0;
    }

    // Add per-request cost if applicable (Only Perplexity supports this)
    if (pricing.input_cost_per_request) {
      totalCost += pricing.input_cost_per_request;
    }

    // Add token-based costs
    if (pricing.input_cost_per_token) {
      totalCost += tokenUsage.promptTokens * pricing.input_cost_per_token;
    }

    if (pricing.output_cost_per_token) {
      totalCost += tokenUsage.completionTokens * pricing.output_cost_per_token;
    }

    return Number(totalCost.toFixed(7));
  } catch (error) {
    logger.error(`Error estimating cost: ${error}`);
    return totalCost;
  }
}

export function estimateCostV2(tokenUsages: TokenUsage[]): number {
  let totalCost = 0;
  try {
    for (const tokenUsage of tokenUsages) {
      let model = tokenUsage.model ?? (process.env.MODEL_NAME || "gpt-4o-mini");
      const pricing = modelPricesV2[model] as ModelPricingV2;

      if (!pricing) {
        logger.error(`No pricing information found for model: ${model}`);
        return 0;
      }

      totalCost += (pricing.input_cost_per_million_tokens * tokenUsage.promptTokens / 10e6) + (pricing.output_cost_per_million_tokens * tokenUsage.completionTokens / 10e6);
    }

    return totalCost;
  } catch (error) {
    logger.error(`Error estimating cost: ${error}`);
    return totalCost;
  }
}

export function calculateTokens(text: string, model: string): number {
  // TODO: Implement for each model
  // const modelConfig = modelPricesV2[model] || modelPricesV2["gpt-4o-mini"];
  
  return Math.ceil(text.length / tokenPerCharacter);
}