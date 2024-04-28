import Turndown from 'turndown'
import OpenAI from 'openai'
// import { LlamaModel } from 'node-llama-cpp'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
    ScraperCompletionResult,
    generateOpenAICompletions,
} from './models.js'
import { ExtractorOptions } from '../entities.js'

  // Generate completion using OpenAI
export function generateCompletions(
    documents: Document[],
    extractionOptions: ExtractorOptions
): Promise < ScraperCompletionResult < T >> [] {
    // const schema = zodToJsonSchema(options.schema)

    const schema = extractionOptions.extractionSchema;
    const prompt = extractionOptions.extractionPrompt;

    const loader = documents.map(async (document, i) => {
        switch (this.client.constructor) {
            case true:
                return generateOpenAICompletions<T>(
                    this.client as OpenAI,
                
                    schema,
                    options?.prompt,
                    options?.temperature
                )
            
            //TODO add other models
            // case LlamaModel:
            //     return generateLlamaCompletions<T>(
            //         this.client,
            //         await page,
            //         schema,
            //         options?.prompt,
            //         options?.temperature
            //     )
            default:
                throw new Error('Invalid client')
        }
    })

    return loader
}
