import { NextResponse } from 'next/server';

const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log(body);
    const {
      url,
      crawlSubPages,
      limit,
      maxDepth,
      excludePaths,
      includePaths,
      extractMainContent
    } = body;

    const endpoint = `${FIRECRAWL_API_URL}/v0/${crawlSubPages ? 'crawl' : 'scrape'}`;

    const requestBody = crawlSubPages ? {
      url,
      crawlerOptions: {
        includes: includePaths ? includePaths.split(',').map((p: string) => p.trim()) : undefined,
        excludes: excludePaths ? excludePaths.split(',').map((p: string) => p.trim()) : undefined,
        maxDepth: maxDepth ? parseInt(maxDepth) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      pageOptions: {
        onlyMainContent: extractMainContent,
      }
    } : {
      url,
      pageOptions: {
        onlyMainContent: extractMainContent,
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Firecrawl API responded with status ${response.status}`);
    }

    const firecrawlResponse = await response.json();

    return NextResponse.json({
      success: true,
      message: crawlSubPages ? 'Crawl process started' : 'Scrape process completed',
      data: firecrawlResponse,
    });

  } catch (error) {
    console.error('Error processing ingestion request:', error);
    return NextResponse.json(
      { success: false, message: 'Error processing ingestion request' },
      { status: 500 }
    );
  }
}