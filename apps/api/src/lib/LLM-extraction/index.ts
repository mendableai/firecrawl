import Turndown from 'turndown'
import OpenAI from 'openai'
// import { LlamaModel } from 'node-llama-cpp'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

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
                return await generateOpenAICompletions({
                    client: llm,
                    document: document,
                    schema: schema,
                    prompt: prompt
                });
            default:
                throw new Error('Invalid client');
        }
    }));

    return completions;
}
