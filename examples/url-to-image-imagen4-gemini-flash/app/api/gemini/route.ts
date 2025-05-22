import { google } from '@ai-sdk/google';
import { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { streamText } from 'ai';
import { isRateLimited } from '@/lib/rate-limit';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await isRateLimited(req, 'gemini');
    if (!rateLimit.success) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': rateLimit.limit.toString(),
            'X-RateLimit-Remaining': rateLimit.remaining.toString(),
          },
        },
      );
    }

    const { prompt } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    /** -------------- AI call -------------- **/
    const result = await streamText({
      model: google('gemini-2.5-flash-preview-05-20'),
      providerOptions: {
        google: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 2048,
          },
        } satisfies GoogleGenerativeAIProviderOptions,
      },
      prompt,
    });

    const encoder = new TextEncoder();

    // Convert the async iterable into a ReadableStream
    const aiStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.fullStream) {
            controller.enqueue(chunk);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    const transformStream = new TransformStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'thinking',
              value: 'Starting to think about your prompt...',
            }) + '\n',
          ),
        );
      },
      transform(chunk: { type: string; textDelta?: string }, controller) {
        try {
          if (chunk.type === 'reasoning') {
            let thinkingText = chunk.textDelta || '';
            thinkingText = thinkingText.replace(/^\*\*[\w\s]+\*\*\n\n/g, '');

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'thinking',
                  value: thinkingText,
                }) + '\n',
              ),
            );
          } else if (chunk.type === 'text-delta') {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'text-delta',
                  textDelta: chunk.textDelta,
                }) + '\n',
              ),
            );
          }
        } catch (err) {
          console.error('Error processing chunk:', err);
        }
      },
      flush(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
      },
    });

    const ndjsonStream = aiStream.pipeThrough(transformStream);

    return new Response(ndjsonStream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error in Gemini API route:', err);
    return new Response(JSON.stringify({ error: 'An error occurred while processing your request. Please try again later.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
