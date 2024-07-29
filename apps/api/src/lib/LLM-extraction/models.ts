import OpenAI from "openai";
import { Document } from "../../lib/entities";
import { numTokensFromString } from "./helpers";

export type ScraperCompletionResult = {
  data: any | null;
  url: string;
};

const maxTokens = 32000;
const modifier = 4;
const defaultPrompt =
  "You are a professional web scraper. Extract the contents of the webpage";

function prepareOpenAIDoc(
  document: Document,
  mode: "markdown" | "raw-html"
): [OpenAI.Chat.Completions.ChatCompletionContentPart[], number] {

  let markdown = document.markdown;

  let extractionTarget = document.markdown;

  if (mode === "raw-html") {
    extractionTarget = document.rawHtml;
  }

  // Check if the markdown content exists in the document
  if (!extractionTarget) {
    throw new Error(
      `${mode} content is missing in the document. This is likely due to an error in the scraping process. Please try again or reach out to help@mendable.ai`
    );
  }




  // count number of tokens
  const numTokens = numTokensFromString(extractionTarget, "gpt-4");

  if (numTokens > maxTokens) {
    // trim the document to the maximum number of tokens, tokens != characters
    extractionTarget = extractionTarget.slice(0, (maxTokens * modifier));
  }

  return [[{ type: "text", text: extractionTarget }], numTokens];
}

export async function generateOpenAICompletions({
  client,
  model = process.env.MODEL_NAME || "gpt-4o",
  document,
  schema, //TODO - add zod dynamic type checking
  prompt = defaultPrompt,
  temperature,
  mode
}: {
  client: OpenAI;
  model?: string;
  document: Document;
  schema: any; // This should be replaced with a proper Zod schema type when available
  prompt?: string;
  temperature?: number;
  mode: "markdown" | "raw-html";
}): Promise<Document> {
  const openai = client as OpenAI;
  const [content, numTokens] = prepareOpenAIDoc(document, mode);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
      { role: "user", content },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "extract_content",
          description: "Extracts the content from the given webpage(s)",
          parameters: schema,
        },
      },
    ],
    tool_choice: { "type": "function", "function": {"name": "extract_content"}},
    temperature,
  });

  const c = completion.choices[0].message.tool_calls[0].function.arguments;

  // Extract the LLM extraction content from the completion response
  const llmExtraction = JSON.parse(c);

  // Return the document with the LLM extraction content added
  return {
    ...document,
    llm_extraction: llmExtraction,
    warning: numTokens > maxTokens ? `Page was trimmed to fit the maximum token limit defined by the LLM model (Max: ${maxTokens} tokens, Attemped: ${numTokens} tokens). If results are not good, email us at help@mendable.ai so we can help you.` : undefined,
  };
}

