import OpenAI from "openai";
import { encoding_for_model } from "@dqbd/tiktoken";

/**
 * Function to generate a roast for a website based on its screenshot and markdown content.
 * @param roastPrompt - Initial prompt text for the roast.
 * @param screenshotUrl - URL of the screenshot of the website.
 * @param content - Raw markdown content of the website.
 */
export async function roastPrompt(roastPrompt: string, screenshotUrl: string, content: string) {
    try {
        // Initialize OpenAI with the API key from environment variables
        const openai = new OpenAI({
            apiKey: process.env.OPEN_AI_KEY
        });

    
        let contentTruncated = await truncateContentToFit(content, 30000);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: roastPrompt },
                        { type: "image_url", image_url: { url: screenshotUrl, detail: "low" } },
                        { type: "text", text: contentTruncated }
                    ],
                },
            ],
        });
        // Return the first choice's message instead of logging it
        return response.choices[0].message.content;
    } catch (error) {
        console.error("Error generating roast:", error);
        // Assert error as an instance of Error to access message property
        return `Error generating roast: ${(error as Error).message}`;
    }
}



export function numTokensFromString(message: string, model: string): number {
    const encoder = encoding_for_model(model as any);

    // Encode the message into tokens
    const tokens = encoder.encode(message);

    // Free the encoder resources after use
    encoder.free();

    // Return the number of tokens
    return tokens.length;
}



async function truncateContentToFit(content: string, maxTokens: number): Promise<string> {
    const modifier = 4;

    let contentTotruncate = content;
    const numTokens = numTokensFromString(contentTotruncate, "gpt-4");

    if (numTokens > maxTokens) {
        // trim the document to the maximum number of tokens, tokens != characters
        contentTotruncate = content.slice(0, (maxTokens * modifier));

    }
    return contentTotruncate
}




