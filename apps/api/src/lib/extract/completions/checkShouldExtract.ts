import { logger } from "../../../lib/logger";
import { buildDocument } from "../build-document";
import { Document, TokenUsage } from "../../../controllers/v1/types";
import { generateCompletions } from "../../../scraper/scrapeURL/transformers/llmExtract";
import {
  buildShouldExtractSystemPrompt,
  buildShouldExtractUserPrompt,
} from "../build-prompts";
import { getModel } from "../../../lib/generic-ai";
import { CostTracking } from "../extraction-service";

export async function checkShouldExtract(
  prompt: string,
  multiEntitySchema: any,
  doc: Document,
  costTracking: CostTracking,
): Promise<{ tokenUsage: TokenUsage; extract: boolean; }> {
  const shouldExtractCheck = await generateCompletions({
    logger: logger.child({ method: "extractService/checkShouldExtract" }),
    options: {
      mode: "llm",
      systemPrompt: buildShouldExtractSystemPrompt(),
      prompt: buildShouldExtractUserPrompt(prompt, multiEntitySchema),
      schema: {
        type: "object",
        properties: {
          extract: {
            type: "boolean",
          },
        },
        required: ["extract"],
      },
    },
    markdown: buildDocument(doc),
    isExtractEndpoint: true,
    model: getModel("gpt-4o-mini", "openai"),
    costTrackingOptions: {
      costTracking,
      metadata: {
        module: "extract",
        method: "checkShouldExtract",
      },
    },
  });

  return {
    tokenUsage: shouldExtractCheck.totalUsage,
    extract: shouldExtractCheck.extract["extract"],
  };
}
