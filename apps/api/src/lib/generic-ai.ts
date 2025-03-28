import { createOpenAI } from '@ai-sdk/openai';
import { createOllama } from "ollama-ai-provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createAnthropic } from "@ai-sdk/anthropic";

const modelAdapter = process.env.OLLAMA_BASE_URL ? createOllama({
    baseURL: process.env.OLLAMA_BASE_URL,
}) : createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
});

export function getModel(name: string) {
    return process.env.MODEL_NAME ? modelAdapter(process.env.MODEL_NAME) : modelAdapter(name);
}

export function getGemini() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
}

export function getGroq() {
  return createGroq({
    apiKey: process.env.GROQ_API_KEY ?? "",
  });
}

export function getAnthropic() {
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  });
} // claude-3-7-sonnet-latest

export function getOpenAI() {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? ""
  });
}

export function getEmbeddingModel(name: string) {
    return process.env.MODEL_EMBEDDING_NAME ? modelAdapter.embedding(process.env.MODEL_EMBEDDING_NAME) : modelAdapter.embedding(name);
}
