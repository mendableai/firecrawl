import OpenAI from "openai";
import Ajv from "ajv";
const ajv = new Ajv(); // Initialize AJV for JSON schema validation

import { generateOpenAICompletions } from "./models";
import { Document, ExtractorOptions } from "../entities";
import { Logger } from "../logger";

// Generate completion using OpenAI
export async function generateCompletions(
  documents: Document[],
  extractionOptions: ExtractorOptions,
  mode: "markdown" | "raw-html"
): Promise<Document[]> {
  // const schema = zodToJsonSchema(options.schema)

  const schema = extractionOptions.extractionSchema;
  const prompt = extractionOptions.extractionPrompt;

  const switchVariable = "openAI"; // Placholder, want to think more about how we abstract the model provider

  const completions = await Promise.all(
    documents.map(async (document: Document) => {
      switch (switchVariable) {
        case "openAI":
          const llm = new OpenAI();
          try{
          const completionResult = await generateOpenAICompletions({
            client: llm,
            document: document,
            schema: schema,
            prompt: prompt,
            mode: mode,
          });
          // Validate the JSON output against the schema using AJV
          const validate = ajv.compile(schema);
          if (!validate(completionResult.llm_extraction)) {
            //TODO: add Custom Error handling middleware that bubbles this up with proper Error code, etc.
            throw new Error(
              `JSON parsing error(s): ${validate.errors
                ?.map((err) => err.message)
                .join(", ")}\n\nLLM extraction did not match the extraction schema you provided. This could be because of a model hallucination, or an Error on our side. Try adjusting your prompt, and if it doesn't work reach out to support.`
            );
          }

          return completionResult;
        } catch (error) {
          Logger.error(`Error generating completions: ${error}`);
          throw new Error(`Error generating completions: ${error.message}`);
        }
        default:
          throw new Error("Invalid client");
      }
    })
  );

  return completions;
}
