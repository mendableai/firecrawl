import { logger } from "../../../lib/logger";
import { buildDocument } from "../build-document";
import { Document, TokenUsage } from "../../../controllers/v1/types";
import { generateOpenAICompletions } from "../../../scraper/scrapeURL/transformers/llmExtract";
import {
  buildShouldExtractSystemPrompt,
  buildShouldExtractUserPrompt,
} from "../build-prompts";

export async function checkShouldExtract(
  prompt: string,
  multiEntitySchema: any,
  doc: Document,
): Promise<{ tokenUsage: TokenUsage; extract: boolean }> {
  const shouldExtractCheck = await generateOpenAICompletions(
    logger.child({ method: "extractService/checkShouldExtract" }),
    {
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
    buildDocument(doc),
    undefined,
    true,
  );

  return {
    tokenUsage: shouldExtractCheck.totalUsage,
    extract: shouldExtractCheck.extract["extract"],
  };
}
