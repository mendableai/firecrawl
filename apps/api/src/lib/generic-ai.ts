import { openai } from '@ai-sdk/openai';
import { createOllama } from "ollama-ai-provider/dist";

const modelAdapter = process.env.OLLAMA_BASE_URL ? createOllama({
    baseURL: process.env.OLLAMA_BASE_URL!,
}) : openai;

export function getModel(name: string) {
    return process.env.MODEL_NAME ? modelAdapter(process.env.MODEL_NAME) : modelAdapter(name);
}
