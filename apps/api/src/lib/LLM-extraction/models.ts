import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Document } from "../../lib/entities";
import { numTokensFromString } from "./helpers";
import { Logger } from "../../lib/logger";

// Add client type enum
export type LLMClientType = "openai" | "anthropic";

const maxTokens = 32000;
const modifier = 4;
const defaultPrompt =
  "You are a professional web scraper. Extract the contents of the webpage";

function prepareOpenAIDoc(
  document: Document,
  mode: "markdown" | "raw-html"
): [{ type: "text"; text: string }[], number] | null {
  let markdown = document.markdown;

  let extractionTarget = document.markdown;

  if (mode === "raw-html") {
    extractionTarget = document.rawHtml;
  }

  // Check if the markdown content exists in the document
  if (!extractionTarget) {
    return null;
    // throw new Error(
    //   `${mode} content is missing in the document. This is likely due to an error in the scraping process. Please try again or reach out to help@mendable.ai`
    // );
  }

  // count number of tokens
  const numTokens = numTokensFromString(extractionTarget, "gpt-4");

  if (numTokens > maxTokens) {
    // trim the document to the maximum number of tokens, tokens != characters
    extractionTarget = extractionTarget.slice(0, maxTokens * modifier);
  }
  return [[{ type: "text", text: extractionTarget }], numTokens];
}

export async function generateLlmCompletions({
  clientType = "openai",
  model = process.env.MODEL_NAME || "gpt-4o-mini",
  document,
  schema, //TODO - add zod dynamic type checking
  systemPrompt = defaultPrompt,
  prompt,
  temperature,
  mode,
}: {
  clientType?: LLMClientType;
  model?: string;
  document: Document;
  schema: any; // This should be replaced with a proper Zod schema type when available
  prompt?: string;
  systemPrompt?: string;
  temperature?: number;
  mode: "markdown" | "raw-html";
}): Promise<Document> {
  const preparedDoc = prepareOpenAIDoc(document, mode);

  if (preparedDoc === null) {
    return {
      ...document,
      warning:
        "LLM extraction was not performed since the document's content is empty or missing.",
    };
  }
  const [content, numTokens] = preparedDoc;

  let llmExtraction;
  Logger.info(
    `Now extracting with LLM: ${clientType} ${model} ${schema} ${systemPrompt} ${prompt} ${temperature} ${mode}`
  );

  if (clientType === "anthropic") {
    const anthropicClient = new Anthropic({});
    const response =
      prompt && !schema
        ? await anthropicClient.messages.create({
            model: model,
            max_tokens: 8192, //maximum for Cluade 3.5 Sonnet
            temperature: temperature ?? 0,
            system: systemPrompt,
            messages: [
              {
                role: "user" as const,
                content: content[0].text,
              },
              {
                role: "user" as const,
                content: `Transform the above content into structured json output based on the following user request: ${prompt}`,
              },
            ],
          })
        : await anthropicClient.messages.create({
            model: model,
            max_tokens: 8192, //maximum for Cluade 3.5 Sonnet
            temperature: temperature ?? 0,
            system: systemPrompt,
            messages: [
              {
                role: "user" as const,
                content: content[0].text,
              },
              {
                role: "user" as const,
                content: `Transform the above content into structured json output based on the following user request: ${prompt}`,
              },
            ],
            tool_choice: {
              type: "tool" as const,
              name: "extract_content",
            },
            tools: [
              {
                name: "extract_content",
                description: "Extracts the content from the given webpage(s)",
                input_schema: schema,
              },
            ],
          });

    Logger.info(`Anthropic response: ${JSON.stringify(response)}`);

    try {
      switch (response.content[0].type) {
        case "text":
          llmExtraction = JSON.parse(response.content[0].text);
          Logger.info(`LLM extraction: ${JSON.stringify(llmExtraction)}`);
          break;
        case "tool_use":
          llmExtraction = response.content[0].input;
          Logger.info(`LLM extraction: ${JSON.stringify(llmExtraction)}`);
          break;
      }
    } catch (e) {
      throw new Error("Invalid JSON response from Anthropic");
    }
  } else {
    const openai = new OpenAI();
    let completion;
    if (prompt && !schema) {
      const jsonCompletion = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          { role: "user", content },
          {
            role: "user",
            content: `Transform the above content into structured json output based on the following user request: ${prompt}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature,
      });

      try {
        llmExtraction = JSON.parse(
          jsonCompletion.choices[0].message.content.trim()
        );
      } catch (e) {
        throw new Error("Invalid JSON");
      }
    } else {
      completion = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
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
        tool_choice: {
          type: "function",
          function: { name: "extract_content" },
        },
        temperature,
      });
      const c = completion.choices[0].message.tool_calls[0].function.arguments;

      // Extract the LLM extraction content from the completion response
      try {
        llmExtraction = JSON.parse(c);
      } catch (e) {
        throw new Error("Invalid JSON");
      }
    }
  }

  return {
    ...document,
    llm_extraction: llmExtraction,
    warning:
      numTokens > maxTokens
        ? `Page was trimmed to fit the maximum token limit defined by the LLM model (Max: ${maxTokens} tokens, Attemped: ${numTokens} tokens). If results are not good, email us at help@mendable.ai so we can help you.`
        : undefined,
  };
}
