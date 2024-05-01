import OpenAI from "openai";
import { Document } from "../../lib/entities";

export type ScraperCompletionResult = {
  data: any | null;
  url: string;
};

const defaultPrompt =
  "You are a professional web scraper. Extract the contents of the webpage";

function prepareOpenAIDoc(
  document: Document
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  // Check if the markdown content exists in the document
  if (!document.markdown) {
    throw new Error(
      "Markdown content is missing in the document. This is likely due to an error in the scraping process. Please try again or reach out to help@mendable.ai"
    );
  }

  return [{ type: "text", text: document.markdown }];
}

export async function generateOpenAICompletions({
  client,
  model = "gpt-4-turbo",
  document,
  schema, //TODO - add zod dynamic type checking
  prompt = defaultPrompt,
  temperature,
}: {
  client: OpenAI;
  model?: string;
  document: Document;
  schema: any; // This should be replaced with a proper Zod schema type when available
  prompt?: string;
  temperature?: number;
}): Promise<Document> {
  const openai = client as OpenAI;
  const content = prepareOpenAIDoc(document);

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
  };
}

