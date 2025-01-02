import FirecrawlApp, { type CrawlParams, type CrawlResponse, type CrawlStatusResponse, type MapResponse, type ScrapeResponse } from '../../../index';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { describe, test, expect } from '@jest/globals';

dotenv.config();

const TEST_API_KEY = process.env.TEST_API_KEY;
const API_URL = process.env.API_URL ?? "https://api.firecrawl.dev";

describe('FirecrawlApp E2E Tests', () => {
  test.concurrent('should throw error for no API key only for cloud service', async () => {
    if (API_URL.includes('api.firecrawl.dev')) {
      // Should throw for cloud service
      expect(() => {
        new FirecrawlApp({ apiKey: null, apiUrl: API_URL });
      }).toThrow("No API key provided");
    } else {
      // Should not throw for self-hosted
      expect(() => {
        new FirecrawlApp({ apiKey: null, apiUrl: API_URL });
      }).not.toThrow();
    }
  });

  test.concurrent('should throw error for invalid API key on scrape', async () => {
    if (API_URL.includes('api.firecrawl.dev')) {
      const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
      await expect(invalidApp.scrapeUrl('https://roastmywebsite.ai')).rejects.toThrow("Unexpected error occurred while trying to scrape URL. Status code: 404");
    } else {
      const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
      await expect(invalidApp.scrapeUrl('https://roastmywebsite.ai')).resolves.not.toThrow();
    }
  });

  test.concurrent('should throw error for blocklisted URL on scrape', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const blocklistedUrl = "https://facebook.com/fake-test";
    await expect(app.scrapeUrl(blocklistedUrl)).rejects.toThrow("Request failed with status code 403");
  });

  test.concurrent('should return successful response with valid preview token', async () => {
    const app = new FirecrawlApp({ apiKey: "this_is_just_a_preview_token", apiUrl: API_URL });
    const response = await app.scrapeUrl('https://roastmywebsite.ai');
    if (!response.success) {
      throw new Error(response.error);
    }

    expect(response).not.toBeNull();
    expect(response?.markdown).toContain("_Roast_");
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response for valid scrape', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl('https://roastmywebsite.ai');
    if (!response.success) {
      throw new Error(response.error);
    }

    expect(response).not.toBeNull();
    expect(response).not.toHaveProperty('content'); // v0
    expect(response).not.toHaveProperty('html');
    expect(response).not.toHaveProperty('rawHtml');
    expect(response).not.toHaveProperty('screenshot');
    expect(response).not.toHaveProperty('links');

    expect(response).toHaveProperty('markdown');
    expect(response).toHaveProperty('metadata');
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response with valid API key and options', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl(
      'https://roastmywebsite.ai', {
        formats: ['markdown', 'html', 'rawHtml', 'screenshot', 'links'],
        headers: { "x-key": "test" },
        includeTags: ['h1'],
        excludeTags: ['h2'],
        onlyMainContent: true,
        timeout: 30000,
        waitFor: 1000
    });
    if (!response.success) {
      throw new Error(response.error);
    }

    expect(response).not.toBeNull();
    expect(response).not.toHaveProperty('content'); // v0
    expect(response.markdown).toContain("_Roast_");
    expect(response.html).toContain("<h1");
    expect(response.rawHtml).toContain("<h1");
    expect(response.screenshot).not.toBeUndefined();
    expect(response.screenshot).not.toBeNull();
    expect(response.screenshot).toContain("https://");
    expect(response.links).not.toBeNull();
    expect(response.links?.length).toBeGreaterThan(0);
    expect(response.links?.[0]).toContain("https://");
    expect(response.metadata).not.toBeNull();
    expect(response.metadata).not.toBeUndefined();
    expect(response.metadata).toHaveProperty("title");
    expect(response.metadata).toHaveProperty("description");
    expect(response.metadata).toHaveProperty("keywords");
    expect(response.metadata).toHaveProperty("robots");
    expect(response.metadata).toHaveProperty("ogTitle");
    expect(response.metadata).toHaveProperty("ogDescription");
    expect(response.metadata).toHaveProperty("ogUrl");
    expect(response.metadata).toHaveProperty("ogImage");
    expect(response.metadata).toHaveProperty("ogLocaleAlternate");
    expect(response.metadata).toHaveProperty("ogSiteName");
    expect(response.metadata).toHaveProperty("sourceURL");
    expect(response.metadata).not.toHaveProperty("pageStatusCode");
    expect(response.metadata).toHaveProperty("statusCode");
    expect(response.metadata).not.toHaveProperty("pageError");

    if (response.metadata !== undefined) {
      expect(response.metadata.error).toBeUndefined();
      expect(response.metadata.title).toBe("Roast My Website");
      expect(response.metadata.description).toBe("Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️");
      expect(response.metadata.keywords).toBe("Roast My Website,Roast,Website,GitHub,Firecrawl");
      expect(response.metadata.robots).toBe("follow, index");
      expect(response.metadata.ogTitle).toBe("Roast My Website");
      expect(response.metadata.ogDescription).toBe("Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️");
      expect(response.metadata.ogUrl).toBe("https://www.roastmywebsite.ai");
      expect(response.metadata.ogImage).toBe("https://www.roastmywebsite.ai/og.png");
      expect(response.metadata.ogLocaleAlternate).toStrictEqual([]);
      expect(response.metadata.ogSiteName).toBe("Roast My Website");
      expect(response.metadata.sourceURL).toBe("https://roastmywebsite.ai");
      expect(response.metadata.statusCode).toBe(200);
    }
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response with valid API key and screenshot fullPage', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl(
      'https://roastmywebsite.ai', {
        formats: ['screenshot@fullPage'],
    });
    if (!response.success) {
      throw new Error(response.error);
    }

    expect(response).not.toBeNull();
    expect(response.screenshot).not.toBeUndefined();
    expect(response.screenshot).not.toBeNull();
    expect(response.screenshot).toContain("https://");
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response for valid scrape with PDF file', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl('https://arxiv.org/pdf/astro-ph/9301001.pdf');
    if (!response.success) {
      throw new Error(response.error);
    }

    expect(response).not.toBeNull();
    expect(response?.markdown).toContain('We present spectrophotometric observations of the Broad Line Radio Galaxy');
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response for valid scrape with PDF file without explicit extension', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl('https://arxiv.org/pdf/astro-ph/9301001');
    if (!response.success) {
      throw new Error(response.error);
    }

    expect(response).not.toBeNull();
    expect(response?.markdown).toContain('We present spectrophotometric observations of the Broad Line Radio Galaxy');
  }, 30000); // 30 seconds timeout

  test.concurrent('should throw error for invalid API key on crawl', async () => {
    if (API_URL.includes('api.firecrawl.dev')) {
      const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
      await expect(invalidApp.crawlUrl('https://roastmywebsite.ai')).rejects.toThrow("Request failed with status code 404");
    } else {
      const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
      await expect(invalidApp.crawlUrl('https://roastmywebsite.ai')).resolves.not.toThrow();
    }
  });

  test.concurrent('should return successful response for crawl and wait for completion', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.crawlUrl('https://roastmywebsite.ai', {}, 30) as CrawlStatusResponse;
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("total");
    expect(response.total).toBeGreaterThan(0);
    expect(response).toHaveProperty("creditsUsed");
    expect(response.creditsUsed).toBeGreaterThan(0);
    expect(response).toHaveProperty("expiresAt");
    expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(response).toHaveProperty("status");
    expect(response.status).toBe("completed");
    expect(response).not.toHaveProperty("next"); // wait until done
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data[0]).not.toBeNull();
    expect(response.data[0]).not.toBeUndefined();
    if (response.data[0]) {
      expect(response.data[0]).toHaveProperty("markdown");
      expect(response.data[0].markdown).toContain("_Roast_");
      expect(response.data[0]).not.toHaveProperty('content'); // v0
      expect(response.data[0]).not.toHaveProperty("html");
      expect(response.data[0]).not.toHaveProperty("rawHtml");
      expect(response.data[0]).not.toHaveProperty("screenshot");
      expect(response.data[0]).not.toHaveProperty("links");
      expect(response.data[0]).toHaveProperty("metadata");
      expect(response.data[0].metadata).toHaveProperty("title");
      expect(response.data[0].metadata).toHaveProperty("description");
      expect(response.data[0].metadata).toHaveProperty("language");
      expect(response.data[0].metadata).toHaveProperty("sourceURL");
      expect(response.data[0].metadata).toHaveProperty("statusCode");
      expect(response.data[0].metadata).not.toHaveProperty("error");
    }
  }, 60000); // 60 seconds timeout

  test.concurrent('should return successful response for crawl with options and wait for completion', async () => {    
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.crawlUrl('https://roastmywebsite.ai', {
      excludePaths: ['blog/*'],
      includePaths: ['/'],
      maxDepth: 2,
      ignoreSitemap: true,
      limit: 10,
      allowBackwardLinks: true,
      allowExternalLinks: true,
      scrapeOptions: {
        formats: ['markdown', 'html', 'rawHtml', 'screenshot', 'links'],
        headers: { "x-key": "test" },
        includeTags: ['h1'],
        excludeTags: ['h2'],
        onlyMainContent: true,
        waitFor: 1000
      }
    } as CrawlParams, 30) as CrawlStatusResponse;
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("total");
    expect(response.total).toBeGreaterThan(0);
    expect(response).toHaveProperty("creditsUsed");
    expect(response.creditsUsed).toBeGreaterThan(0);
    expect(response).toHaveProperty("expiresAt");
    expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(response).toHaveProperty("status");
    expect(response.status).toBe("completed");
    expect(response).not.toHaveProperty("next");
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data[0]).not.toBeNull();
    expect(response.data[0]).not.toBeUndefined();
    if (response.data[0]) {
      expect(response.data[0]).toHaveProperty("markdown");
      expect(response.data[0].markdown).toContain("_Roast_");
      expect(response.data[0]).not.toHaveProperty('content'); // v0
      expect(response.data[0]).toHaveProperty("html");
      expect(response.data[0].html).toContain("<h1");
      expect(response.data[0]).toHaveProperty("rawHtml");
      expect(response.data[0].rawHtml).toContain("<h1");
      expect(response.data[0]).toHaveProperty("screenshot");
      expect(response.data[0].screenshot).toContain("https://");
      expect(response.data[0]).toHaveProperty("links");
      expect(response.data[0].links).not.toBeNull();
      expect(response.data[0].links?.length).toBeGreaterThan(0);
      expect(response.data[0]).toHaveProperty("metadata");
      expect(response.data[0].metadata).toHaveProperty("title");
      expect(response.data[0].metadata).toHaveProperty("description");
      expect(response.data[0].metadata).toHaveProperty("language");
      expect(response.data[0].metadata).toHaveProperty("sourceURL");
      expect(response.data[0].metadata).toHaveProperty("statusCode");
      expect(response.data[0].metadata).not.toHaveProperty("error");
    }
  }, 60000); // 60 seconds timeout

  test.concurrent('should handle idempotency key for crawl', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const uniqueIdempotencyKey = uuidv4();
    const response = await app.asyncCrawlUrl('https://roastmywebsite.ai', {}, uniqueIdempotencyKey) as CrawlResponse;
    expect(response).not.toBeNull();
    expect(response.id).toBeDefined();

    await expect(app.crawlUrl('https://roastmywebsite.ai', {}, 2, uniqueIdempotencyKey)).rejects.toThrow("Request failed with status code 409");
  });

  test.concurrent('should check crawl status', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.asyncCrawlUrl('https://firecrawl.dev', { scrapeOptions: { formats: ['markdown', 'html', 'rawHtml', 'screenshot', 'links']}} as CrawlParams) as CrawlResponse;
    expect(response).not.toBeNull();
    expect(response.id).toBeDefined();

    let statusResponse = await app.checkCrawlStatus(response.id);
    const maxChecks = 15;
    let checks = 0;

    expect(statusResponse.success).toBe(true);
    while ((statusResponse as any).status === 'scraping' && checks < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      expect(statusResponse).not.toHaveProperty("partial_data"); // v0
      expect(statusResponse).not.toHaveProperty("current"); // v0
      expect(statusResponse).toHaveProperty("data");
      expect(statusResponse).toHaveProperty("total");
      expect(statusResponse).toHaveProperty("creditsUsed");
      expect(statusResponse).toHaveProperty("expiresAt");
      expect(statusResponse).toHaveProperty("status");
      expect(statusResponse).toHaveProperty("next");
      expect(statusResponse.success).toBe(true);
      if (statusResponse.success === true) {
        expect(statusResponse.total).toBeGreaterThan(0);
        expect(statusResponse.creditsUsed).toBeGreaterThan(0);
        expect(statusResponse.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(statusResponse.status).toBe("scraping");
        expect(statusResponse.next).toContain("/v1/crawl/");
      }
      statusResponse = await app.checkCrawlStatus(response.id) as CrawlStatusResponse;
      expect(statusResponse.success).toBe(true);
      checks++;
    }

    expect(statusResponse).not.toBeNull();
    expect(statusResponse).toHaveProperty("total");
    expect(statusResponse.success).toBe(true);
    if (statusResponse.success === true) {
      expect(statusResponse.total).toBeGreaterThan(0);
      expect(statusResponse).toHaveProperty("creditsUsed");
      expect(statusResponse.creditsUsed).toBeGreaterThan(0);
      expect(statusResponse).toHaveProperty("expiresAt");
      expect(statusResponse.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(statusResponse).toHaveProperty("status");
      expect(statusResponse.status).toBe("completed");
      expect(statusResponse.data.length).toBeGreaterThan(0);
      expect(statusResponse.data[0]).not.toBeNull();
      expect(statusResponse.data[0]).not.toBeUndefined();
      if (statusResponse.data[0]) {
        expect(statusResponse.data[0]).toHaveProperty("markdown");
        expect(statusResponse.data[0].markdown?.length).toBeGreaterThan(10);
        expect(statusResponse.data[0]).not.toHaveProperty('content'); // v0
        expect(statusResponse.data[0]).toHaveProperty("html");
        expect(statusResponse.data[0].html).toContain("<div");
        expect(statusResponse.data[0]).toHaveProperty("rawHtml");
        expect(statusResponse.data[0].rawHtml).toContain("<div");
        expect(statusResponse.data[0]).toHaveProperty("screenshot");
        expect(statusResponse.data[0].screenshot).toContain("https://");
        expect(statusResponse.data[0]).toHaveProperty("links");
        expect(statusResponse.data[0].links).not.toBeNull();
        expect(statusResponse.data[0].links?.length).toBeGreaterThan(0);
        expect(statusResponse.data[0]).toHaveProperty("metadata");
        expect(statusResponse.data[0].metadata).toHaveProperty("title");
        expect(statusResponse.data[0].metadata).toHaveProperty("description");
        expect(statusResponse.data[0].metadata).toHaveProperty("language");
        expect(statusResponse.data[0].metadata).toHaveProperty("sourceURL");
        expect(statusResponse.data[0].metadata).toHaveProperty("statusCode");
        expect(statusResponse.data[0].metadata).not.toHaveProperty("error");
      }
    }
  }, 60000); // 60 seconds timeout

  test.concurrent('should throw error for invalid API key on map', async () => {
    if (API_URL.includes('api.firecrawl.dev')) {
      const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
      await expect(invalidApp.mapUrl('https://roastmywebsite.ai')).rejects.toThrow("Request failed with status code 404");
    } else {
      const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
      await expect(invalidApp.mapUrl('https://roastmywebsite.ai')).resolves.not.toThrow();
    }
  });

  test.concurrent('should throw error for blocklisted URL on map', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const blocklistedUrl = "https://facebook.com/fake-test";
    await expect(app.mapUrl(blocklistedUrl)).rejects.toThrow("Request failed with status code 403");
  });

  test.concurrent('should return successful response with valid preview token', async () => {
    const app = new FirecrawlApp({ apiKey: "this_is_just_a_preview_token", apiUrl: API_URL });
    const response = await app.mapUrl('https://roastmywebsite.ai') as MapResponse;
    expect(response).not.toBeNull();
    expect(response.links?.length).toBeGreaterThan(0);
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response for valid map', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });    const response = await app.mapUrl('https://roastmywebsite.ai') as MapResponse;
    expect(response).not.toBeNull();
    
    expect(response.links?.length).toBeGreaterThan(0);
    expect(response.links?.[0]).toContain("https://");
    const filteredLinks = response.links?.filter((link: string) => link.includes("roastmywebsite.ai"));
    expect(filteredLinks?.length).toBeGreaterThan(0);
  }, 30000); // 30 seconds timeout

  

  test('should search with string query', async () => {
    const app = new FirecrawlApp({ apiUrl: API_URL, apiKey: TEST_API_KEY });
    const response = await app.search("firecrawl");
    expect(response.success).toBe(true);
    console.log(response.data);
    expect(response.data?.length).toBeGreaterThan(0);
    expect(response.data?.[0]?.markdown).toBeDefined();
    expect(response.data?.[0]?.metadata).toBeDefined();
    expect(response.data?.[0]?.metadata?.title).toBeDefined();
    expect(response.data?.[0]?.metadata?.description).toBeDefined();
  });

  test('should search with params object', async () => {
    const app = new FirecrawlApp({ apiUrl: API_URL, apiKey: TEST_API_KEY });
    const response = await app.search("firecrawl", {
      limit: 3,
      lang: 'en',
      country: 'us',
      scrapeOptions: {
        formats: ['markdown', 'html', 'links'],
        onlyMainContent: true
      }
    });
    expect(response.success).toBe(true);
    expect(response.data.length).toBeLessThanOrEqual(3);
    for (const doc of response.data) {
      expect(doc.markdown).toBeDefined();
      expect(doc.html).toBeDefined();
      expect(doc.links).toBeDefined();
      expect(doc.metadata).toBeDefined();
      expect(doc.metadata?.title).toBeDefined();
      expect(doc.metadata?.description).toBeDefined();
    }
  });

  test('should handle invalid API key for search', async () => {
    const app = new FirecrawlApp({ apiUrl: API_URL, apiKey: "invalid_api_key" });
    await expect(app.search("test query")).rejects.toThrow("Request failed with status code 404");
  });
});
