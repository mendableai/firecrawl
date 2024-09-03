import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { Logger } from '../../../lib/logger';

export async function getImageDescription(
  imageUrl: string,
  backText: string,
  frontText: string,
  model: string = "gpt-4-turbo"
): Promise<string> {
  try {
    const prompt = "What's in the image? You need to answer with the content for the alt tag of the image. To help you with the context, the image is in the following text: " +
      backText +
      " and the following text: " +
      frontText +
      ". Be super concise."

    switch (model) {
      case 'claude-3-opus': {
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error("No Anthropic API key provided");
        }
        const imageRequest = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageMediaType = 'image/png';
        const imageData = Buffer.from(imageRequest.data, 'binary').toString('base64');

        const anthropic = new Anthropic();
        const response = await anthropic.messages.create({
          model: "claude-3-opus-20240229",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: imageMediaType,
                    data: imageData,
                  },
                },
                {
                  type: "text",
                  text: prompt
                }
              ],
            }
          ]
        });

        return response[0].content.text;
      }
      default: {
        if (!process.env.OPENAI_API_KEY) {
          throw new Error("No OpenAI API key provided");
        }

        const { OpenAI } = require("openai");
        const openai = new OpenAI();
      
        const response = await openai.chat.completions.create({
          model: "gpt-4-turbo",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
        });
        return response.choices[0].message.content;
      }
    }
  } catch (error) {
    Logger.error(`Error generating image alt text: ${error}`);
    return "";
  }
}
