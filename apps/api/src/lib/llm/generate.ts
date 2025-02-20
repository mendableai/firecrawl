import OpenAI from "openai";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GenerateTextOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}

export async function generateText(options: GenerateTextOptions) {
  const { model, messages, temperature = 0.7, maxTokens } = options;

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  return {
    text: completion.choices[0].message.content || "",
    usage: completion.usage,
  };
} 