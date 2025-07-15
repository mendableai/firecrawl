import { encoding_for_model } from "@dqbd/tiktoken";
import { TiktokenModel } from "@dqbd/tiktoken";

// This function calculates the number of tokens in a text string using GPT-3.5-turbo model
export function numTokensFromString(message: string, model: string): number {
  const encoder = encoding_for_model(model as TiktokenModel);

  // Encode the message into tokens
  let tokens: Uint32Array;
  try {
    tokens = encoder.encode(message);
  } catch (error) {
    message = message.replace("<|endoftext|>", "");
    tokens = encoder.encode(message);
  }

  // Free the encoder resources after use
  encoder.free();

  // Return the number of tokens
  return tokens.length;
}
