// Last updated: 2025-04-01
// Prices from https://openrouter.ai/models

// TODO: merge with model-prices.ts

export const modelPrices = {
  "gpt-4o": {
    input_cost_per_million_tokens: 2.5,
    output_cost_per_million_tokens: 10,
  },
  "gpt-4o-mini": {
    input_cost_per_million_tokens: 0.15,
    output_cost_per_million_tokens: 0.6
  },
  "o3-mini": {
    input_cost_per_million_tokens: 1.1,
    output_cost_per_million_tokens: 4.4
  },
  "gemini-2.0-flash": {
    input_cost_per_million_tokens: 0.15,
    output_cost_per_million_tokens: 0.6
  },
  "claude-3-7-sonnet-latest": {
    input_cost_per_million_tokens: 3,
    output_cost_per_million_tokens: 15
  },
  "claude-3-5-sonnet-latest": {
    input_cost_per_million_tokens: 0.8,
    output_cost_per_million_tokens: 4
  }
}