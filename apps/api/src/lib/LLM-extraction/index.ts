import OpenAI from "openai";
import Ajv from "ajv";
const ajv = new Ajv(); // Initialize AJV for JSON schema validation

import { generateOpenAICompletions } from "./models";
import { Document, ExtractorOptions } from "../entities";

// Generate completion using OpenAI
export async function generateCompletions(
  documents: Document[],
  extractionOptions: ExtractorOptions
): Promise<{success: boolean, error: string, documents: Document[]}> {
  // const schema = zodToJsonSchema(options.schema)

  const schema = extractionOptions.extractionSchema;
  const prompt = extractionOptions.extractionPrompt;

  const switchVariable = "openAI"; // Placeholder, want to think more about how we abstract the model provider

  const completions : {
    success: boolean;
    error: string;
    document: Document;
  }[] = await Promise.all(
    documents.map(async (document: Document) => {
      let completionResult : Document;
      switch (switchVariable) {
        case "openAI":
          const llm = new OpenAI();
          try {
            completionResult = await generateOpenAICompletions({
              client: llm,
              document: document,
              schema: schema,
              prompt: prompt,
            });
          } catch (error) {
            console.error(`Error generating OpenAI completions: ${error}`);
            return { success: false, error: `Error generating OpenAI completions: ${error}`, document: null };
          }
          // Validate the JSON output against the schema using AJV
          const validate = ajv.compile(schema);
          if (!validate(completionResult.llm_extraction)) {
            //TODO: add Custom Error handling middleware that bubbles this up with proper Error code, etc.
            console.error(
              `LLM extraction did not match the extraction schema you provided. This could be because of a model hallucination, or an Error on our side. Try adjusting your prompt, and if it doesn't work reach out to support. JSON parsing error(s): ${validate.errors
                ?.map((err) => err.message)
                .join(", ")}`
            );
            return { success: false, error: `LLM extraction did not match the extraction schema you provided. This could be because of a model hallucination, or a parsing error. Try adjusting your prompt, and if it doesn't work reach out to support. JSON parsing error(s): ${validate.errors ? validate.errors.map((err) => err.message).join(", ") : "No errors found in the parse."}`, document: null };
          }

          return { success: true, error: "", document: completionResult };
        default:
          console.error("Invalid client");
          return null
      }
    })
  );

  // Filter out the null values
  const validCompletions = completions.filter(completion => completion !== null);
  validCompletions.map(completion => console.log(completion.document.llm_extraction))

  // TODO: handle the non valid completions

  return { success: true, error: "", documents: validCompletions.map(completion => completion.document) as Document[] };
}
