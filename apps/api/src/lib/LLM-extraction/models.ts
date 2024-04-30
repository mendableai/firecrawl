import OpenAI from 'openai'
import { z } from 'zod'
import { Document, ExtractorOptions } from "../../lib/entities";
import { numTokensFromString } from './helpers';

// import {
//   LlamaModel,
//   LlamaJsonSchemaGrammar,
//   LlamaContext,
//   LlamaChatSession,
//   GbnfJsonSchema,
// } from 'node-llama-cpp'
// import { JsonSchema7Type } from 'zod-to-json-schema'

export type ScraperCompletionResult<T extends z.ZodSchema<any>> = {
  data: any | null
  url: string
}

const defaultPrompt =
  'You are a professional web scraper. Extract the contents of the webpage'

function prepareOpenAIDoc(
  document: Document
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {

  // Check if the markdown content exists in the document
  if (!document.markdown) {
    throw new Error("Markdown content is missing in the document.");
  }

  return [{ type: 'text', text: document.html}]
}

export async function generateOpenAICompletions({
  client,
  model = 'gpt-4-turbo',
  document,
  schema, //TODO - add zod dynamic type checking
  prompt = defaultPrompt,
  temperature
}: {
  client: OpenAI,
  model?: string,
  document: Document,
  schema: any, // This should be replaced with a proper Zod schema type when available
  prompt?: string,
  temperature?: number
}): Promise<Document> {
  const openai = client as OpenAI
  const content = prepareOpenAIDoc(document)


  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: prompt,
      },
      { role: 'user', content },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'extract_content',
          description: 'Extracts the content from the given webpage(s)',
          parameters: schema,
        },
      },
    ],
    tool_choice: 'auto',
    temperature,
  })

  const c = completion.choices[0].message.tool_calls[0].function.arguments
  
  // Extract the LLM extraction content from the completion response
  const llmExtraction = JSON.parse(c);

//   console.log("llm extraction: ", llmExtraction);


  // Return the document with the LLM extraction content added
  return {
    ...document,
    llm_extraction: llmExtraction
  };
   
}

// export async function generateLlamaCompletions<T extends z.ZodSchema<any>>(
//   model: LlamaModel,
//   page: ScraperLoadResult,
//   schema: JsonSchema7Type,
//   prompt: string = defaultPrompt,
//   temperature?: number
// ): Promise<ScraperCompletionResult<T>> {
//   const grammar = new LlamaJsonSchemaGrammar(schema as GbnfJsonSchema) as any // any, because it has weird type inference going on
//   const context = new LlamaContext({ model })
//   const session = new LlamaChatSession({ context })
//   const pagePrompt = `${prompt}\n${page.content}`

//   const result = await session.prompt(pagePrompt, {
//     grammar,
//     temperature,
//   })

//   const parsed = grammar.parse(result)
//   return {
//     data: parsed,
//     url: page.url,
//   }
// }
