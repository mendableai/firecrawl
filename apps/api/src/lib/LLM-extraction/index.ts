import OpenAI from "openai";
import Ajv from "ajv";
const ajv = new Ajv(); // Initialize AJV for JSON schema validation

import { generateLlmCompletions } from "./models";
import { Document, ExtractorOptions } from "../entities";
import { Logger } from "../logger";

// Generate completion using OpenAI
export async function generateCompletions(
  documents: Document[],
  extractionOptions: ExtractorOptions,
  mode: "markdown" | "raw-html"
): Promise<Document[]> {
  Logger.info("attempting to generate LLM completion");
  Logger.info(`extractionOptions: ${JSON.stringify(extractionOptions)}`);
  // const schema = zodToJsonSchema(options.schema)

  const schema = extractionOptions.extractionSchema;
  const systemPrompt = extractionOptions.extractionPrompt;
  const prompt = extractionOptions.userPrompt;

  const completions = await Promise.all(
    documents.map(async (document: Document) => {
      try {
        const completionResult = await generateLlmCompletions({
          clientType: extractionOptions.llmOptions
            ? extractionOptions.llmOptions.provider
            : "openai",
          model: extractionOptions.llmOptions
            ? extractionOptions.llmOptions.model
            : "gpt-4o-mini",
          document: document,
          schema: schema,
          prompt: prompt,
          systemPrompt: systemPrompt,
          mode: mode,
        });
        // Validate the JSON output against the schema using AJV
        if (schema) {
          const validate = ajv.compile(schema);
          if (!validate(completionResult.llm_extraction)) {
            //TODO: add Custom Error handling middleware that bubbles this up with proper Error code, etc.
            throw new Error(
              `JSON parsing error(s): ${validate.errors
                ?.map((err) => err.message)
                .join(
                  ", "
                )}\n\nLLM extraction did not match the extraction schema you provided. This could be because of a model hallucination, or an Error on our side. Try adjusting your prompt, and if it doesn't work reach out to support.`
            );
          }
        }

        return completionResult;
      } catch (error) {
        Logger.error(`Error generating completions: ${error}`);
        throw error;
      }
    })
  );

  return completions;
}
