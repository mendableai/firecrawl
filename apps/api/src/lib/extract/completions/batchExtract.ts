import { logger } from "../../../lib/logger";
import { generateCompletions } from "../../../scraper/scrapeURL/transformers/llmExtract";
import { buildDocument } from "../build-document";
import { ExtractResponse, TokenUsage } from "../../../controllers/v1/types";
import { Document } from "../../../controllers/v1/types";
import {
  buildBatchExtractPrompt,
  buildBatchExtractSystemPrompt,
} from "../build-prompts";
import { getModel } from "../../generic-ai";
import fs from "fs/promises";
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
  const model = getModel("gpt-4", "openai");
  const completion = await generateCompletions({
    logger: logger.child({
      method: "extractService/generateCompletions",
    }),
    options: {
      mode: "llm",
      systemPrompt: buildBatchExtractSystemPrompt(
        systemPrompt,
        multiEntitySchema,
        links,
      ),
      prompt: buildBatchExtractPrompt(prompt),
      schema: multiEntitySchema,
    },
    markdown: buildDocument(doc),
    isExtractEndpoint: true,
    model: model,
  });
  await fs.writeFile(
    `logs/batchExtract-${crypto.randomUUID()}.json`,
    JSON.stringify(completion, null, 2),
  );

  return {
    extract: completion.extract,
    numTokens: completion.totalUsage.totalTokens,
    totalUsage: {
      promptTokens: completion.totalUsage.promptTokens ?? 0,
      completionTokens: completion.totalUsage.completionTokens ?? 0,
      totalTokens: completion.totalUsage.totalTokens ?? 0,
      model: model.modelId,
    },
    sources: [doc.metadata.url || doc.metadata.sourceURL || ""]
  };
}
