import { openai, createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";
import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { fireworks } from "@ai-sdk/fireworks";
import { deepinfra } from "@ai-sdk/deepinfra";
import { createVertex } from "@ai-sdk/google-vertex";

type Provider =
  | "openai"
  | "ollama"
  | "anthropic"
  | "groq"
  | "google"
  | "openrouter"
  | "fireworks"
  | "deepinfra"
  | "vertex";
const defaultProvider: Provider = process.env.OLLAMA_BASE_URL
  ? "ollama"
  : "openai";

// Configure OpenAI provider with custom base URL if provided
// This allows using OpenAI-compatible providers by setting the OPENAI_BASE_URL environment variable
// The provider will use the standard OPENAI_API_KEY for authentication
const configuredOpenAI = process.env.OPENAI_BASE_URL
  ? createOpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY || '',
    })
  : openai;

const providerList: Record<Provider, any> = {
  openai: configuredOpenAI, //OPENAI_API_KEY with optional OPENAI_BASE_URL
  ollama: createOllama({
    baseURL: process.env.OLLAMA_BASE_URL,
  }),
  anthropic, //ANTHROPIC_API_KEY
  groq, //GROQ_API_KEY
  google, //GOOGLE_GENERATIVE_AI_API_KEY
  openrouter: createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  }),
  fireworks, //FIREWORKS_API_KEY
  deepinfra, //DEEPINFRA_API_KEY
  vertex: createVertex({
    project: "firecrawl",
    location: "us-central1",
    googleAuthOptions: process.env.VERTEX_CREDENTIALS ? {
      credentials: JSON.parse(atob(process.env.VERTEX_CREDENTIALS)),
    } : {
      keyFile: "./gke-key.json",
    },
  }),
};

export function getModel(name: string, provider: Provider = defaultProvider) {
  return process.env.MODEL_NAME
    ? providerList[provider](process.env.MODEL_NAME)
    : providerList[provider](name);
}

export function getEmbeddingModel(
  name: string,
  provider: Provider = defaultProvider,
) {
  return process.env.MODEL_EMBEDDING_NAME
    ? providerList[provider].embedding(process.env.MODEL_EMBEDDING_NAME)
    : providerList[provider].embedding(name);
}
