import Turndown from 'turndown'
import OpenAI from 'openai'
// import { LlamaModel } from 'node-llama-cpp'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import Ajv from 'ajv';
const ajv = new Ajv(); // Initialize AJV for JSON schema validation

import {
    ScraperCompletionResult,
    generateOpenAICompletions,
} from './models'
import { Document, ExtractorOptions } from '../entities'

  // Generate completion using OpenAI
export async function generateCompletions(
    documents: Document[],
    extractionOptions: ExtractorOptions
): Promise<Document[]> {
    // const schema = zodToJsonSchema(options.schema)

    const schema = extractionOptions.extractionSchema;
    const prompt = extractionOptions.extractionPrompt;

    const switchVariable = "openAI" // Placholder, want to think more about how we abstract the model provider


    const completions = await Promise.all(documents.map(async (document: Document) => {
        switch (switchVariable) {
            case "openAI":
                const llm = new OpenAI();
                const completionResult = await generateOpenAICompletions({
                    client: llm,
                    document: document,
                    schema: schema,
                    prompt: prompt
                });
                // Validate the JSON output against the schema using AJV
                const validate = ajv.compile(schema);
                if (!validate(completionResult.llm_extraction)) {
                    throw new Error(`LLM extraction did not match the extraction schema you provided. This could be because of a model hallucination, or an Error on our side. Try adjusting your prompt, and if it doesn't work reach out to support. AJV error: ${validate.errors?.map(err => err.message).join(', ')}`);
                }

                return completionResult;
            default:
                throw new Error('Invalid client');
        }
    }));
    

    return completions;
}
