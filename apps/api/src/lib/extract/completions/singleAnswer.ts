import { logger } from "../../../lib/logger";
import { generateCompletions } from "../../../scraper/scrapeURL/transformers/llmExtract";
import { buildDocument } from "../build-document";
import { Document, TokenUsage } from "../../../controllers/v1/types";
import { getModel } from "../../../lib/generic-ai";

export async function singleAnswerCompletion({
  singleAnswerDocs,
  rSchema,
  links,
  prompt,
  systemPrompt,
}: {
  singleAnswerDocs: Document[];
  rSchema: any;
  links: string[];
  prompt: string;
  systemPrompt: string;
}): Promise<{
  extract: any;
  tokenUsage: TokenUsage;
  sources: string[];
}> {
  const model = getModel("gpt-4", "openai");
  const completion = await generateCompletions({
    logger: logger.child({ module: "extract", method: "generateCompletions" }),
    options: {
      mode: "llm",
      systemPrompt:
        (systemPrompt ? `${systemPrompt}\n` : "") +
        "Always prioritize using the provided content to answer the question. Do not make up an answer. Do not hallucinate. In case you can't find the information and the string is required, instead of 'N/A' or 'Not speficied', return an empty string: '', if it's not a string and you can't find the information, return null. Be concise and follow the schema always if provided.",
      prompt: "Today is: " + new Date().toISOString() + "\n" + prompt,
      schema: rSchema,
    },
    markdown: singleAnswerDocs.map((x) => buildDocument(x)).join("\n"),
    isExtractEndpoint: true,
    model: model,
  });
  return { 
    extract: completion.extract, 
    tokenUsage: {
      promptTokens: completion.totalUsage.promptTokens ?? 0,
      completionTokens: completion.totalUsage.completionTokens ?? 0,
      totalTokens: completion.totalUsage.totalTokens ?? 0,
      model: model.modelId,
    },
    sources: singleAnswerDocs.map(doc => doc.metadata.url || doc.metadata.sourceURL || "")
  };
}
