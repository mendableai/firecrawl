import { logger } from "../../../lib/logger";
import { generateOpenAICompletions } from "../../../scraper/scrapeURL/transformers/llmExtract";
import { buildDocument } from "../build-document";
import { Document, TokenUsage } from "../../../controllers/v1/types";

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
  const completion = await generateOpenAICompletions(
    logger.child({ module: "extract", method: "generateOpenAICompletions" }),
    {
      mode: "llm",
      systemPrompt:
        (systemPrompt ? `${systemPrompt}\n` : "") +
        "Always prioritize using the provided content to answer the question. Do not make up an answer. Do not hallucinate. In case you can't find the information and the string is required, instead of 'N/A' or 'Not speficied', return an empty string: '', if it's not a string and you can't find the information, return null. Be concise and follow the schema always if provided. Here are the urls the user provided of which he wants to extract information from: " +
        links.join(", "),
      prompt: "Today is: " + new Date().toISOString() + "\n" + prompt,
      schema: rSchema,
    },
    singleAnswerDocs.map((x) => buildDocument(x)).join("\n"),
    undefined,
    true,
  );
  return { 
    extract: completion.extract, 
    tokenUsage: completion.totalUsage,
    sources: singleAnswerDocs.map(doc => doc.metadata.url || doc.metadata.sourceURL || "")
  };
}
