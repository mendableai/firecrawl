// use llmExtract.ts instead

// import OpenAI from "openai";
// import { encoding_for_model } from "@dqbd/tiktoken";
// import { TiktokenModel } from "@dqbd/tiktoken";
// import { ExtractOptions } from "../../controllers/v1/types";
// import { Document } from "../entities";
// import { z } from "zod";

// const maxTokens = 32000;
// const modifier = 4;

// export class LLMRefusalError extends Error {
//   constructor(refusal: string) {
//     super("LLM refused to extract the website's content");
//     this.name = "LLMRefusalError";
//   }
// }

// interface GenerateCompletionsParams {
//   systemPrompt?: string;
//   prompt?: string;
//   schema?: any;
//   pagesContent: string;
// }

// export async function generateBasicCompletion(prompt: string) {
//   const openai = new OpenAI();
//   const model: TiktokenModel =
//     (process.env.MODEL_NAME as TiktokenModel) ?? "gpt-4o-mini";

//   const completion = await openai.chat.completions.create({
//     model,
//     messages: [{ role: "user", content: prompt }],
//   });

//   return completion.choices[0].message.content;
// }

// export async function generateFinalExtraction({
//   pagesContent,
//   systemPrompt,
//   prompt,
//   schema,
// }: GenerateCompletionsParams): Promise<{
//   content: string;
//   metadata: { numTokens: number; warning: string };
// }> {
//   const openai = new OpenAI();
//   const model: TiktokenModel =
//     (process.env.MODEL_NAME as TiktokenModel) ?? "gpt-4o-mini";

//   let extractionContent = pagesContent;
//   let numTokens = 0;
//   let warning = "";

//   const encoder = encoding_for_model(model);
//   try {
//     const tokens = encoder.encode(extractionContent);
//     numTokens = tokens.length;
//   } catch (error) {
//     extractionContent = extractionContent.slice(0, maxTokens * modifier);
//     warning = `Failed to derive number of LLM tokens the extraction might use -- the input has been automatically trimmed to the maximum number of tokens (${maxTokens}) we support.`;
//   } finally {
//     encoder.free();
//   }

//   if (numTokens > maxTokens) {
//     extractionContent = extractionContent.slice(0, maxTokens * modifier);
//     warning = `The extraction content would have used more tokens (${numTokens}) than the maximum we allow (${maxTokens}). -- the input has been automatically trimmed.`;
//   }

//   if (schema && (schema.type === "array" || schema._type === "ZodArray")) {
//     schema = {
//       type: "object",
//       properties: {
//         items: schema,
//       },
//       required: ["items"],
//       additionalProperties: false,
//     };
//   } else if (schema) {
//     schema.additionalProperties = false;
//     schema.required = Object.keys(schema.properties);
//   }

//   const jsonCompletion = await openai.beta.chat.completions.parse({
//     temperature: 0,
//     model,
//     messages: [
//       { role: "system", content: systemPrompt ?? "" },
//       { role: "user", content: [{ type: "text", text: extractionContent }] },
//       {
//         role: "user",
//         content: prompt
//           ? `Transform the above content into structured JSON output based on the following user request: ${prompt}`
//           : "Transform the above content into structured JSON output.",
//       },
//     ],
//     response_format: schema
//       ? {
//           type: "json_schema",
//           json_schema: {
//             name: "websiteContent",
//             schema: schema,
//             strict: true,
//           },
//         }
//       : { type: "json_object" },
//   });

//   if (jsonCompletion.choices[0].message.refusal !== null) {
//     throw new LLMRefusalError(jsonCompletion.choices[0].message.refusal);
//   }

//   const extraction = jsonCompletion.choices[0].message.parsed;
//   return {
//     content: extraction ?? "",
//     metadata: {
//       numTokens,
//       warning,
//     },
//   };
// }
