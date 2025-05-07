#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import FirecrawlApp, {
  type ScrapeParams,
  type MapParams,
  type CrawlParams,
  type FirecrawlDocument,
} from '@mendable/firecrawl-js';

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const endpointUsageExamples = {
  scrape: `Example:
When you need content from a single specific URL (like "https://example.com/about"), use scrape:
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/about"
  }
}`,
  map: `Example:
When you need to discover all URLs on a website before deciding what to scrape, use map:
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com"
  }
}
Then use the results to make targeted scrape requests for specific pages.`,
  crawl: `Example:
When you need to extract content from multiple pages within a website and can handle large responses, use crawl:
{
  "name": "firecrawl_crawl",
  "arguments": {
    "url": "https://example.com/blog",
    "limit": 5,
    "maxDepth": 2
  }
}
Note: Crawl responses can be very large. Consider using map + scrape or search for specific information.`,
  search: `Example:
When looking for specific information across the web, use search:
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "latest AI research papers 2023",
    "limit": 5
  }
}
Then examine the results before potentially scraping specific pages.`,
  extract: `Example:
When you need structured data from a webpage, use extract:
{
  "name": "firecrawl_extract",
  "arguments": {
    "urls": ["https://example.com/product"],
    "prompt": "Extract product information",
    "schema": {
      "name": "string",
      "price": "number",
      "description": "string"
    }
  }
}`,
  deepResearch: `Example:
For complex research questions requiring exploration of multiple sources:
{
  "name": "firecrawl_deep_research",
  "arguments": {
    "query": "What are the environmental impacts of electric vehicles compared to gasoline vehicles?",
    "maxDepth": 5,
    "maxUrls": 10
  }
}`,
  generateLLMsTxt: `Example:
To generate standardized LLMs.txt for a website:
{
  "name": "firecrawl_generate_llmstxt",
  "arguments": {
    "url": "https://example.com"
  }
}`
};

const commonMisuseCases = [
  {
    problem: "Using crawl for single page information retrieval",
    solution: "Use scrape instead of crawl when you only need content from a single specific URL. This is faster and more efficient.",
    detection: (args: any) => args.limit === 1 || !args.limit,
    recommendation: "Consider using firecrawl_scrape instead for single page extraction."
  },
  {
    problem: "Token overflow from large crawl responses",
    solution: "Limit the crawl depth and number of pages to avoid exceeding token limits.",
    detection: (args: any) => !args.limit || args.limit > 10 || !args.maxDepth || args.maxDepth > 3,
    recommendation: "Add limit (recommend 5-10) and maxDepth (recommend 2-3) parameters to prevent token overflow."
  },
  {
    problem: "Not using map for URL discovery",
    solution: "Use map to discover URLs before deciding what to scrape, especially for large websites.",
    detection: (crawlArgs: any) => crawlArgs.url?.includes("*") || crawlArgs.url?.includes("..."),
    recommendation: "Use firecrawl_map first to discover relevant URLs, then use firecrawl_scrape on specific pages."
  },
  {
    problem: "Inefficient information search",
    solution: "Use search when looking for specific information rather than crawling entire websites.",
    detection: (args: any) => args.url?.includes("search") || args.url?.includes("query"),
    recommendation: "Consider using firecrawl_search which is optimized for finding specific information."
  },
  {
    problem: "Not using extract for structured data",
    solution: "Use extract for structured data instead of trying to parse it from scraped content.",
    detection: (args: any) => args.extractionPrompt || args.extraction,
    recommendation: "Use firecrawl_extract which is designed for extracting structured data using AI."
  }
];

const SCRAPE_TOOL: Tool = {
  name: 'firecrawl_scrape',
  description: 
    `Scrape a single webpage and extract its content in markdown format.
    
✅ RECOMMENDED for: 
- Extracting content from a single specific URL
- When you know exactly which page contains the information you need
- When you need fast results or have token constraints

❌ NOT RECOMMENDED for:
- Extracting content from multiple pages (use map + scrape or crawl)
- When you're unsure which page contains the information (use search)
- When you need structured data (use extract)

${endpointUsageExamples.scrape}`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to scrape'
      },
      formats: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['markdown', 'html', 'rawHtml', 'links', 'json']
        },
        description: 'Optional formats to include in the response',
        default: ['markdown']
      },
      onlyMainContent: {
        type: 'boolean',
        description: 'Only return the main content of the page (excluding headers, footers, etc.)',
        default: true
      }
    },
    required: ['url']
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'number',
        description: 'HTTP status code'
      },
      success: {
        type: 'boolean',
        description: 'Whether the request was successful'
      },
      content: {
        type: 'string',
        description: 'The content of the page in markdown format'
      },
      metadata: {
        type: 'object',
        description: 'Metadata about the scraped page'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const MAP_TOOL: Tool = {
  name: 'firecrawl_map',
  description: 
    `Discover and map URLs from a starting URL without extracting the full content.
    
✅ RECOMMENDED for:
- Discovering all URLs on a website before deciding what to scrape
- When you need to find specific sections of a website
- As a preliminary step before targeted scraping

❌ NOT RECOMMENDED for:
- When you already know which specific URL you need (use scrape)
- When you need the content of the pages (use scrape after mapping)

${endpointUsageExamples.map}`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The base URL to start mapping from'
      },
      search: {
        type: 'string',
        description: 'Optional search query to filter URLs'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of URLs to return',
        default: 100
      },
      ignoreSitemap: {
        type: 'boolean',
        description: 'Ignore the website sitemap when mapping',
        default: false
      }
    },
    required: ['url']
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the request was successful'
      },
      urls: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'List of discovered URLs'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const CRAWL_TOOL: Tool = {
  name: 'firecrawl_crawl',
  description: 
    `Crawl multiple pages from a starting URL and extract their content.
    
⚠️ WARNING: Crawl responses can be very large and may exceed token limits.
    
✅ RECOMMENDED for:
- Extracting content from multiple related pages
- When you need comprehensive coverage of a website
- When you need to analyze interconnected content

❌ NOT RECOMMENDED for:
- Extracting content from a single page (use scrape)
- When token limits are a concern (use map + scrape)
- When you need fast results (crawling can be slow)

${endpointUsageExamples.crawl}`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The base URL to start crawling from'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of pages to crawl (STRONGLY RECOMMENDED: keep this between 5-10 to avoid token overflow)',
        default: 5
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth to crawl relative to the base URL (STRONGLY RECOMMENDED: keep this between 1-3)',
        default: 2
      },
      excludePaths: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'URL pathname regex patterns to exclude from the crawl'
      },
      includePaths: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'URL pathname regex patterns to include in the crawl'
      },
      formats: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['markdown', 'html', 'rawHtml', 'links', 'json']
        },
        description: 'Formats to include in the output',
        default: ['markdown']
      }
    },
    required: ['url']
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'ID of the crawl job'
      },
      status: {
        type: 'string',
        description: 'Status of the crawl job'
      },
      pages: {
        type: 'array',
        items: {
          type: 'object'
        },
        description: 'List of crawled pages with their content'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const CHECK_CRAWL_STATUS_TOOL: Tool = {
  name: 'firecrawl_check_crawl_status',
  description: 'Check the status of a crawl job. Use this after starting a crawl job to check its progress.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'ID of the crawl job'
      }
    },
    required: ['id']
  },
  outputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'ID of the crawl job'
      },
      status: {
        type: 'string',
        description: 'Status of the crawl job'
      },
      progress: {
        type: 'object',
        description: 'Progress of the crawl job'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const SEARCH_TOOL: Tool = {
  name: 'firecrawl_search',
  description: 
    `Search for information across the web and optionally scrape the results.
    
✅ RECOMMENDED for:
- Finding specific information across multiple websites
- When you don't know which website has the information
- When you need the most relevant content for a query

❌ NOT RECOMMENDED for:
- When you already know which website to scrape (use scrape)
- When you need comprehensive coverage of a single website (use map or crawl)

${endpointUsageExamples.search}`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of search results to return (keep this small, 3-5 is recommended)',
        default: 5,
        minimum: 1,
        maximum: 10
      },
      scrapeOptions: {
        type: 'object',
        description: 'Options for scraping search results',
        properties: {
          formats: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['markdown', 'html', 'rawHtml', 'links']
            },
            description: 'Formats to include in the output',
            default: ['markdown']
          }
        }
      }
    },
    required: ['query']
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the request was successful'
      },
      data: {
        type: 'array',
        items: {
          type: 'object'
        },
        description: 'Search results with optional scraped content'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const EXTRACT_TOOL: Tool = {
  name: 'firecrawl_extract',
  description: 
    `Extract structured data from webpages using AI.
    
✅ RECOMMENDED for:
- Extracting specific structured data (prices, names, details)
- When you need information in a consistent format
- When you need to compare data across pages

❌ NOT RECOMMENDED for:
- When you need the full content of a page (use scrape)
- When you're not looking for specific structured data

${endpointUsageExamples.extract}`,
  inputSchema: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'The URLs to extract data from'
      },
      prompt: {
        type: 'string',
        description: 'Prompt to guide the extraction process'
      },
      schema: {
        type: 'object',
        description: 'Schema defining the structure of the data to extract'
      }
    },
    required: ['urls']
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the request was successful'
      },
      data: {
        type: 'object',
        description: 'The extracted structured data'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const DEEP_RESEARCH_TOOL: Tool = {
  name: 'firecrawl_deep_research',
  description: 
    `Conduct deep research on a topic using AI-powered web exploration.
    
✅ RECOMMENDED for:
- Complex research questions requiring multiple sources
- When you need in-depth analysis of a topic
- When you need a comprehensive answer with citations

❌ NOT RECOMMENDED for:
- Simple questions that can be answered with a single search
- When you need very specific information from a known source
- When you need results quickly (deep research can take time)

${endpointUsageExamples.deepResearch}`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The research query'
      },
      maxDepth: {
        type: 'number',
        description: 'Maximum depth of research iterations',
        default: 5
      },
      maxUrls: {
        type: 'number',
        description: 'Maximum number of URLs to analyze',
        default: 10
      },
      timeLimit: {
        type: 'number',
        description: 'Time limit in seconds',
        default: 300
      }
    },
    required: ['query']
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the request was successful'
      },
      id: {
        type: 'string',
        description: 'ID of the research job'
      },
      data: {
        type: 'object',
        description: 'Research results (may be incomplete if status is processing)'
      },
      status: {
        type: 'string',
        description: 'Status of the research job'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const GENERATE_LLMSTXT_TOOL: Tool = {
  name: 'firecrawl_generate_llmstxt',
  description: 
    `Generate a standardized LLMs.txt file for a website.
    
✅ RECOMMENDED for:
- Creating machine-readable permission guidelines for AI models
- When you need to understand web crawling permissions

${endpointUsageExamples.generateLLMsTxt}`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to generate LLMs.txt for'
      },
      maxUrls: {
        type: 'number',
        description: 'Maximum number of URLs to analyze',
        default: 2
      }
    },
    required: ['url']
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the request was successful'
      },
      id: {
        type: 'string',
        description: 'ID of the LLMs.txt generation job'
      },
      data: {
        type: 'object',
        description: 'Generated LLMs.txt content'
      },
      error: {
        type: 'string',
        description: 'Error message if the request failed'
      }
    }
  }
};

const checkForMisuse = (toolName: string, args: any) => {
  for (const misuse of commonMisuseCases) {
    switch (toolName) {
      case 'firecrawl_crawl':
        if (misuse.detection(args)) {
          return misuse.recommendation;
        }
        break;
      case 'firecrawl_scrape':
        if (toolName === 'firecrawl_scrape' && misuse.problem === "Not using extract for structured data" && misuse.detection(args)) {
          return misuse.recommendation;
        }
        break;
      default:
        break;
    }
  }
  return null;
};

const isLargeResponseWarning = (content: string) => {
  const approxTokens = content.length / 4;
  if (approxTokens > 8000) {
    return `WARNING: The response is very large (approximately ${Math.round(approxTokens)} tokens) and may exceed your model's token limit. Consider using more specific queries or splitting your requests.`;
  }
  return null;
};

const withRetry = async (fn: () => Promise<any>, maxRetries: number = 3, delay: number = 1000) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        const waitTime = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        break;
      }
    }
  }
  throw lastError;
};

const safeLog = (message: string, data?: any) => {
  try {
    console.error(message, data ? JSON.stringify(data) : '');
  } catch (error) {
    console.error(message, 'Error stringifying data');
  }
};

const server = new Server();

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  const misuseRecommendation = checkForMisuse(name, args);
  if (misuseRecommendation) {
    safeLog(`Tool misuse detected for ${name}`, { args });
    return {
      result: {
        warning: misuseRecommendation,
        success: false,
        error: `Not recommended: ${misuseRecommendation}`
      }
    };
  }
  
  switch (name) {
    case 'firecrawl_scrape': {
      try {
        const { url, formats = ['markdown'], onlyMainContent = true } = args;
        
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
          return { 
            result: { 
              success: false, 
              error: 'Invalid URL. Must be a string starting with http:// or https://'
            } 
          };
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const scrapeParams: ScrapeParams = {
          url,
          formats,
          onlyMainContent,
        };
        
        const result = await withRetry(() => firecrawl.scrape(scrapeParams));
        
        if (result.markdown) {
          const warning = isLargeResponseWarning(result.markdown);
          if (warning) {
            result.warning = warning;
          }
        }
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error scraping', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    case 'firecrawl_map': {
      try {
        const { url, search, limit = 100, ignoreSitemap = false } = args;
        
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
          return { 
            result: { 
              success: false, 
              error: 'Invalid URL. Must be a string starting with http:// or https://'
            } 
          };
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const mapParams: MapParams = {
          url,
          search,
          limit,
          ignoreSitemap,
        };
        
        const result = await withRetry(() => firecrawl.map(mapParams));
        
        if (result.urls && result.urls.length > 0) {
          result.guidance = `Found ${result.urls.length} URLs. To get content from specific pages, use firecrawl_scrape with the most relevant URLs.`;
        }
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error mapping', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    case 'firecrawl_crawl': {
      try {
        const { 
          url, 
          limit = 5, 
          maxDepth = 2,
          excludePaths,
          includePaths,
          formats = ['markdown']
        } = args;
        
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
          return { 
            result: { 
              success: false, 
              error: 'Invalid URL. Must be a string starting with http:// or https://'
            } 
          };
        }
        
        if (limit > 10) {
          return {
            result: {
              success: false,
              error: `Limit of ${limit} is too high and may cause token overflow. Please use a limit of 10 or less.`,
              recommendation: "Consider using map + scrape instead for better control over content size."
            }
          };
        }
        
        if (maxDepth > 3) {
          return {
            result: {
              success: false,
              error: `MaxDepth of ${maxDepth} is too high and may cause token overflow. Please use a maxDepth of 3 or less.`,
              recommendation: "Consider using map + scrape instead for better control over content size."
            }
          };
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const crawlParams: CrawlParams = {
          url,
          limit,
          maxDepth,
          excludePaths,
          includePaths,
          scrapeOptions: {
            formats
          }
        };
        
        const result = await withRetry(() => firecrawl.crawl(crawlParams));
        
        result.warning = "Crawl responses can be very large. If you encounter token overflow issues, consider using map + scrape instead.";
        
        if (result.pages) {
          let totalContent = '';
          for (const page of result.pages) {
            if (page.markdown) {
              totalContent += page.markdown;
            }
          }
          
          const warning = isLargeResponseWarning(totalContent);
          if (warning) {
            result.warning = warning;
          }
        }
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error crawling', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    case 'firecrawl_check_crawl_status': {
      try {
        const { id } = args;
        
        if (!id) {
          return {
            result: {
              success: false,
              error: 'Crawl ID is required',
            },
          };
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const result = await withRetry(() => firecrawl.getCrawlStatus(id));
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error checking crawl status', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    case 'firecrawl_search': {
      try {
        const { 
          query, 
          limit = 5,
          scrapeOptions = { formats: ['markdown'] }
        } = args;
        
        if (!query) {
          return {
            result: {
              success: false,
              error: 'Search query is required',
            },
          };
        }
        
        if (limit > 10) {
          return {
            result: {
              success: false,
              error: `Limit of ${limit} is too high and may cause token overflow. Please use a limit of 10 or less.`,
            },
          };
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const result = await withRetry(() => firecrawl.search({
          query,
          limit,
          scrapeOptions
        }));
        
        if (result.data) {
          let totalContent = '';
          for (const item of result.data) {
            if (item.markdown) {
              totalContent += item.markdown;
            }
          }
          
          const warning = isLargeResponseWarning(totalContent);
          if (warning) {
            result.warning = warning;
          }
        }
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error searching', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    case 'firecrawl_extract': {
      try {
        const { urls, prompt, schema } = args;
        
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          return {
            result: {
              success: false,
              error: 'URLs array is required and must not be empty',
            },
          };
        }
        
        for (const url of urls) {
          if (typeof url !== 'string' || !url.startsWith('http')) {
            return { 
              result: { 
                success: false, 
                error: `Invalid URL: ${url}. All URLs must be strings starting with http:// or https://`
              } 
            };
          }
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const result = await withRetry(() => firecrawl.extract({
          urls,
          prompt,
          schema
        }));
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error extracting', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    case 'firecrawl_deep_research': {
      try {
        const { 
          query, 
          maxDepth = 5, 
          maxUrls = 10,
          timeLimit = 300
        } = args;
        
        if (!query) {
          return {
            result: {
              success: false,
              error: 'Research query is required',
            },
          };
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const result = await withRetry(() => firecrawl.deepResearch({
          query,
          maxDepth,
          maxUrls,
          timeLimit
        }));
        
        if (result.id) {
          result.guidance = "Deep research is processing. Check the status periodically using the ID returned.";
        }
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error starting deep research', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    case 'firecrawl_generate_llmstxt': {
      try {
        const { url, maxUrls = 2 } = args;
        
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
          return { 
            result: { 
              success: false, 
              error: 'Invalid URL. Must be a string starting with http:// or https://'
            } 
          };
        }
        
        const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
        const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
        
        if (
          process.env.CLOUD_SERVICE !== 'true' &&
          !FIRECRAWL_API_URL &&
          !FIRECRAWL_API_KEY
        ) {
          return {
            result: {
              success: false,
              error: 'Firecrawl API key is required but not set.',
            },
          };
        }
        
        const firecrawlParams: Record<string, any> = {
          apiKey: FIRECRAWL_API_KEY,
        };
        
        if (FIRECRAWL_API_URL) {
          firecrawlParams.apiUrl = FIRECRAWL_API_URL;
        }
        
        const firecrawl = new FirecrawlApp(firecrawlParams);
        
        const result = await withRetry(() => firecrawl.generateLLMsTxt({
          url,
          maxUrls
        }));
        
        return {
          result,
        };
      } catch (e: any) {
        safeLog('Error generating LLMs.txt', e);
        return {
          result: {
            success: false,
            error: e.message,
          },
        };
      }
    }
    
    default:
      return {
        result: {
          success: false,
          error: `Unknown tool: ${name}`,
        },
      };
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      SCRAPE_TOOL,
      MAP_TOOL,
      CRAWL_TOOL,
      CHECK_CRAWL_STATUS_TOOL,
      SEARCH_TOOL,
      EXTRACT_TOOL,
      DEEP_RESEARCH_TOOL,
      GENERATE_LLMSTXT_TOOL,
    ],
  };
});

const startServer = async () => {
  if (process.env.CLOUD_SERVICE === 'true') {
    const app = express();
    const port = process.env.PORT || 3000;
    
    server.addTransport(new SSEServerTransport());
    
    app.get('/health', (_req: Request, res: Response) => {
      res.status(200).send('OK');
    });
    
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } else {
    server.addTransport(new StdioServerTransport());
  }
};

startServer();
