import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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