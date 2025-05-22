import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';
import { isRateLimited } from '@/lib/rate-limit';

interface FalImage {
  url: string;
  content_type?: string;
  width?: number;
  height?: number;
}

interface FalResponseData {
  images?: FalImage[];
  [key: string]: unknown;
}

interface FalResponse {
  data?: FalResponseData;
  status?: string;
  logs?: Array<{ message: string }>;
  [key: string]: unknown;
}

interface ApiError extends Error {
  status?: number;
}

export async function POST(request: NextRequest) {
  const rateLimit = await isRateLimited(request, 'imagen4');
  
  if (!rateLimit.success) {
    return NextResponse.json({ 
      error: 'Rate limit exceeded. Please try again later.' 
    }, { 
      status: 429,
      headers: {
        'X-RateLimit-Limit': rateLimit.limit.toString(),
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      }
    });
  }

  let apiKey = process.env.FAL_KEY;
  
  if (!apiKey) {
    const headerApiKey = request.headers.get('X-Fal-API-Key');
    
    if (!headerApiKey) {
      return NextResponse.json({ 
        error: 'API configuration error. Please try again later or contact support.' 
      }, { status: 500 });
    }
    
    apiKey = headerApiKey;
  }
  
  fal.config({
    credentials: apiKey,
  });

  try {
    const body = await request.json();
    const { prompt } = body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Invalid request format. Please check your input and try again.' }, { status: 400 });
    }


    const result = await fal.subscribe("fal-ai/imagen4/preview", {
      input: {
        prompt: prompt,
      },
      logs: true,
    }) as FalResponse;

    const images = result?.data?.images;

    if (!images || images.length === 0 || !images[0].url) {
      console.error('Fal.ai did not return a valid image URL within the data object:', result);
      return NextResponse.json({ error: 'Image generation failed. Please try again later.' }, { status: 500 });
    }

    const imageUrl = images[0].url;
    const imageContentType = images[0].content_type;


    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error(`Failed to fetch image from URL: ${imageUrl}. Status: ${imageResponse.status}`);
      return NextResponse.json({ error: 'Failed to process generated image. Please try again later.' }, { status: 500 });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    return NextResponse.json({
      imageBase64: imageBase64,
      contentType: imageContentType || 'image/png',
      falResponse: result
    });

  } catch (error: unknown) {
    console.error('Error in /api/imagen4 endpoint:', error);
    const err = error as ApiError;
    if (err.message && err.message.includes("FAL_KEY")) {
        return NextResponse.json({ error: 'API configuration error. Please try again later or contact support.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'An error occurred while processing your request. Please try again later.' }, { status: 500 });
  }
} 