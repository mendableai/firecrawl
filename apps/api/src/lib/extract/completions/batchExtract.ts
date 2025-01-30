import { logger } from "../../../lib/logger";
import { generateOpenAICompletions } from "../../../scraper/scrapeURL/transformers/llmExtract";
import { buildDocument } from "../build-document";
import { ExtractResponse, TokenUsage } from "../../../controllers/v1/types";
import { Document } from "../../../controllers/v1/types";
import {
  buildBatchExtractPrompt,
  buildBatchExtractSystemPrompt,
} from "../build-prompts";

/**
 * Batch extract information from a list of URLs using a multi-entity schema.
 * @param multiEntitySchema - The schema for the multi-entity extraction
 * @param links - The URLs to extract information from
 * @param prompt - The prompt for the extraction
 * @param systemPrompt - The system prompt for the extraction
 * @param doc - The document to extract information from
 * @returns The completion promise
 */
export async function batchExtractPromise(
  multiEntitySchema: any,
  links: string[],
  prompt: string,
  systemPrompt: string,
  doc: Document,
): Promise<{
  extract: any;
  numTokens: number;
  totalUsage: TokenUsage;
  warning?: string;
  sources: string[];
}> {
  const completion = await generateOpenAICompletions(
    logger.child({
      method: "extractService/generateOpenAICompletions",
    }),
    {
      mode: "llm",
      systemPrompt: buildBatchExtractSystemPrompt(
        systemPrompt,
        multiEntitySchema,
        links,
      ),
      prompt: buildBatchExtractPrompt(prompt),
      schema: multiEntitySchema,
    },
    buildDocument(doc),
    undefined,
    true,
  );

  return {
    extract: completion.extract,
    numTokens: completion.numTokens,
    totalUsage: completion.totalUsage,
    sources: [doc.metadata.url || doc.metadata.sourceURL || ""]
  };
}
