import FirecrawlApp, { CrawlParams, CrawlResponse, CrawlStatusResponse, ScrapeParams, ScrapeResponse } from '../../../index';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { describe, test, expect } from '@jest/globals';

dotenv.config();

const TEST_API_KEY = process.env.TEST_API_KEY;
const API_URL = "http://127.0.0.1:3002";

describe('FirecrawlApp E2E Tests', () => {
  test.concurrent('should throw error for no API key', async () => {
    expect(() => {
      new FirecrawlApp({ apiKey: null, apiUrl: API_URL });
    }).toThrow("No API key provided");
  });

  test.concurrent('should throw error for invalid API key on scrape', async () => {
    const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
    await expect(invalidApp.scrapeUrl('https://roastmywebsite.ai')).rejects.toThrow("Request failed with status code 401");
  });

  test.concurrent('should throw error for blocklisted URL on scrape', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const blocklistedUrl = "https://facebook.com/fake-test";
    await expect(app.scrapeUrl(blocklistedUrl)).rejects.toThrow("Request failed with status code 403");
  });

  test.concurrent('should return successful response with valid preview token', async () => {
    const app = new FirecrawlApp({ apiKey: "this_is_just_a_preview_token", apiUrl: API_URL });
    const response = await app.scrapeUrl('https://roastmywebsite.ai') as ScrapeResponse;
    expect(response).not.toBeNull();
    expect(response.data?.markdown).toContain("_Roast_");
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response for valid scrape', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl('https://roastmywebsite.ai') as ScrapeResponse;
    expect(response).not.toBeNull();
    expect(response.data).not.toHaveProperty('content'); // v0
    expect(response.data).not.toHaveProperty('html');
    expect(response.data).not.toHaveProperty('rawHtml');
    expect(response.data).not.toHaveProperty('screenshot');
    expect(response.data).not.toHaveProperty('links');

    expect(response.data).toHaveProperty('markdown');
    expect(response.data).toHaveProperty('metadata');
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response with valid API key and include HTML', async () => {
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
    }) as ScrapeResponse;
    expect(response).not.toBeNull();
    expect(response.data).not.toHaveProperty('content'); // v0
    expect(response.data?.markdown).toContain("_Roast_");
    expect(response.data?.html).toContain("<h1");
    expect(response.data?.rawHtml).toContain("<h1");
    expect(response.data?.screenshot).not.toBeNull();
    expect(response.data?.links).not.toBeNull();
    expect(response.data?.links?.length).toBeGreaterThan(0);
    expect(response.data?.links?.[0]).toContain("https://");
    expect(response.data?.metadata).not.toBeNull();
    expect(response.data?.metadata).toHaveProperty("title");
    expect(response.data?.metadata).toHaveProperty("description");
    expect(response.data?.metadata).toHaveProperty("keywords");
    expect(response.data?.metadata).toHaveProperty("robots");
    expect(response.data?.metadata).toHaveProperty("ogTitle");
    expect(response.data?.metadata).toHaveProperty("ogDescription");
    expect(response.data?.metadata).toHaveProperty("ogUrl");
    expect(response.data?.metadata).toHaveProperty("ogImage");
    expect(response.data?.metadata).toHaveProperty("ogLocaleAlternate");
    expect(response.data?.metadata).toHaveProperty("ogSiteName");
    expect(response.data?.metadata).toHaveProperty("sourceURL");
    expect(response.data?.metadata).not.toHaveProperty("pageStatusCode");
    expect(response.data?.metadata).toHaveProperty("statusCode");
    expect(response.data?.metadata).not.toHaveProperty("pageError");
    expect(response.data?.metadata.error).toBeUndefined();
    expect(response.data?.metadata.title).toBe("Roast My Website");
    expect(response.data?.metadata.description).toBe("Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️");
    expect(response.data?.metadata.keywords).toBe("Roast My Website,Roast,Website,GitHub,Firecrawl");
    expect(response.data?.metadata.robots).toBe("follow, index");
    expect(response.data?.metadata.ogTitle).toBe("Roast My Website");
    expect(response.data?.metadata.ogDescription).toBe("Welcome to Roast My Website, the ultimate tool for putting your website through the wringer! This repository harnesses the power of Firecrawl to scrape and capture screenshots of websites, and then unleashes the latest LLM vision models to mercilessly roast them. 🌶️");
    expect(response.data?.metadata.ogUrl).toBe("https://www.roastmywebsite.ai");
    expect(response.data?.metadata.ogImage).toBe("https://www.roastmywebsite.ai/og.png");
    expect(response.data?.metadata.ogLocaleAlternate).toStrictEqual([]);
    expect(response.data?.metadata.ogSiteName).toBe("Roast My Website");
    expect(response.data?.metadata.sourceURL).toBe("https://roastmywebsite.ai");
    expect(response.data?.metadata.statusCode).toBe(200);
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response for valid scrape with PDF file', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl('https://arxiv.org/pdf/astro-ph/9301001.pdf') as ScrapeResponse;
    expect(response).not.toBeNull();
    expect(response.data?.markdown).toContain('We present spectrophotometric observations of the Broad Line Radio Galaxy');
  }, 30000); // 30 seconds timeout

  test.concurrent('should return successful response for valid scrape with PDF file without explicit extension', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.scrapeUrl('https://arxiv.org/pdf/astro-ph/9301001') as ScrapeResponse;
    expect(response).not.toBeNull();
    expect(response.data?.markdown).toContain('We present spectrophotometric observations of the Broad Line Radio Galaxy');
  }, 30000); // 30 seconds timeout

  test.concurrent('should throw error for invalid API key on crawl', async () => {
    const invalidApp = new FirecrawlApp({ apiKey: "invalid_api_key", apiUrl: API_URL });
    await expect(invalidApp.crawlUrl('https://roastmywebsite.ai')).rejects.toThrow("Request failed with status code 401");
  });

  test.concurrent('should throw error for blocklisted URL on crawl', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const blocklistedUrl = "https://twitter.com/fake-test";
    await expect(app.crawlUrl(blocklistedUrl)).rejects.toThrow("Request failed with status code 403");
  });

  test.concurrent('should return successful response for crawl and wait for completion', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response = await app.crawlUrl('https://roastmywebsite.ai', {}, true, 30) as CrawlStatusResponse;
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("totalCount");
    expect(response.totalCount).toBeGreaterThan(0);
    expect(response).toHaveProperty("creditsUsed");
    expect(response.creditsUsed).toBeGreaterThan(0);
    expect(response).toHaveProperty("expiresAt");
    expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(response).toHaveProperty("status");
    expect(response.status).toBe("completed");
    expect(response).not.toHaveProperty("next"); // wait until done
    expect(response.data?.length).toBeGreaterThan(0);
    expect(response.data?.[0]).toHaveProperty("markdown");
    expect(response.data?.[0].markdown).toContain("_Roast_");
    expect(response.data?.[0]).not.toHaveProperty('content'); // v0
    expect(response.data?.[0]).not.toHaveProperty("html");
    expect(response.data?.[0]).not.toHaveProperty("rawHtml");
    expect(response.data?.[0]).not.toHaveProperty("screenshot");
    expect(response.data?.[0]).not.toHaveProperty("links");

    expect(response.data?.[0]).toHaveProperty("metadata");
    expect(response.data?.[0].metadata).toHaveProperty("title");
    expect(response.data?.[0].metadata).toHaveProperty("description");
    expect(response.data?.[0].metadata).toHaveProperty("language");
    expect(response.data?.[0].metadata).toHaveProperty("sourceURL");
    expect(response.data?.[0].metadata).toHaveProperty("statusCode");
    expect(response.data?.[0].metadata).toHaveProperty("error");
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
    } as CrawlParams, true, 30) as CrawlStatusResponse;
    expect(response).not.toBeNull();
    expect(response).toHaveProperty("totalCount");
    expect(response.totalCount).toBeGreaterThan(0);
    expect(response).toHaveProperty("creditsUsed");
    expect(response.creditsUsed).toBeGreaterThan(0);
    expect(response).toHaveProperty("expiresAt");
    expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(response).toHaveProperty("status");
    expect(response.status).toBe("completed");
    expect(response).not.toHaveProperty("next");
    expect(response.data?.length).toBeGreaterThan(0);
    expect(response.data?.[0]).toHaveProperty("markdown");
    expect(response.data?.[0].markdown).toContain("_Roast_");
    expect(response.data?.[0]).not.toHaveProperty('content'); // v0
    expect(response.data?.[0]).toHaveProperty("html");
    expect(response.data?.[0].html).toContain("<h1");
    expect(response.data?.[0]).toHaveProperty("rawHtml");
    expect(response.data?.[0].rawHtml).toContain("<h1");
    expect(response.data?.[0]).toHaveProperty("screenshot");
    expect(response.data?.[0].screenshot).toContain("https://");
    expect(response.data?.[0]).toHaveProperty("links");
    expect(response.data?.[0].links).not.toBeNull();
    expect(response.data?.[0].links?.length).toBeGreaterThan(0);
    expect(response.data?.[0]).toHaveProperty("metadata");
    expect(response.data?.[0].metadata).toHaveProperty("title");
    expect(response.data?.[0].metadata).toHaveProperty("description");
    expect(response.data?.[0].metadata).toHaveProperty("language");
    expect(response.data?.[0].metadata).toHaveProperty("sourceURL");
    expect(response.data?.[0].metadata).toHaveProperty("statusCode");
    expect(response.data?.[0].metadata).toHaveProperty("error");
  }, 60000); // 60 seconds timeout

  test.concurrent('should handle idempotency key for crawl', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const uniqueIdempotencyKey = uuidv4();
    const response = await app.crawlUrl('https://roastmywebsite.ai', {}, false, 2, uniqueIdempotencyKey) as CrawlResponse;
    expect(response).not.toBeNull();
    expect(response.jobId).toBeDefined();

    await expect(app.crawlUrl('https://roastmywebsite.ai', {}, true, 2, uniqueIdempotencyKey)).rejects.toThrow("Request failed with status code 409");
  });

  test.concurrent('should check crawl status', async () => {
    const app = new FirecrawlApp({ apiKey: TEST_API_KEY, apiUrl: API_URL });
    const response: any = await app.crawlUrl('https://roastmywebsite.ai', { crawlerOptions: { excludes: ['blog/*'] } }, false) as CrawlStatusResponse;
    expect(response).not.toBeNull();
    expect(response.jobId).toBeDefined();

    let statusResponse: any = await app.checkCrawlStatus(response.jobId);
    const maxChecks = 15;
    let checks = 0;

    while (statusResponse.status === 'scraping' && checks < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(statusResponse).not.toHaveProperty("partial_data"); // v0
      expect(statusResponse).not.toHaveProperty("current"); // v0
      expect(statusResponse).toHaveProperty("data");
      expect(statusResponse).toHaveProperty("totalCount");
      expect(statusResponse).toHaveProperty("creditsUsed");
      expect(statusResponse).toHaveProperty("expiresAt");
      expect(statusResponse).toHaveProperty("status");
      expect(statusResponse).toHaveProperty("next");
      expect(statusResponse.totalCount).toBeGreaterThan(0);
      expect(statusResponse.creditsUsed).toBeGreaterThan(0);
      expect(statusResponse.expiresAt).toBeGreaterThan(Date.now());
      expect(statusResponse.status).toBe("scraping");
      expect(statusResponse.next).toContain("/v1/crawl/");
      statusResponse = await app.checkCrawlStatus(response.jobId) as CrawlResponse;
      checks++;
    }

    expect(response).not.toBeNull();
    expect(response).toHaveProperty("totalCount");
    expect(response.totalCount).toBeGreaterThan(0);
    expect(response).toHaveProperty("creditsUsed");
    expect(response.creditsUsed).toBeGreaterThan(0);
    expect(response).toHaveProperty("expiresAt");
    expect(response.expiresAt).toBeGreaterThan(Date.now());
    expect(response).toHaveProperty("status");
    expect(response.status).toBe("completed");
    expect(response).toHaveProperty("next");
    expect(response.next).toContain("/v1/crawl/");
    expect(response.data?.length).toBeGreaterThan(0);
    expect(response.data?.[0]).toHaveProperty("markdown");
    expect(response.data?.[0].markdown).toContain("_Roast_");
    expect(response.data?.[0]).not.toHaveProperty('content'); // v0
    expect(response.data?.[0].markdown).toContain("_Roast_");
    expect(response.data?.[0]).toHaveProperty("html");
    expect(response.data?.[0].html).toContain("<h1");
    expect(response.data?.[0]).toHaveProperty("rawHtml");
    expect(response.data?.[0].rawHtml).toContain("<h1");
    expect(response.data?.[0]).toHaveProperty("screenshot");
    expect(response.data?.[0].screenshot).toContain("https://");
    expect(response.data?.[0]).toHaveProperty("links");
    expect(response.data?.[0].links).not.toBeNull();
    expect(response.data?.[0].links?.length).toBeGreaterThan(0);
    expect(response.data?.[0]).toHaveProperty("metadata");
    expect(response.data?.[0].metadata).toHaveProperty("title");
    expect(response.data?.[0].metadata).toHaveProperty("description");
    expect(response.data?.[0].metadata).toHaveProperty("language");
    expect(response.data?.[0].metadata).toHaveProperty("sourceURL");
    expect(response.data?.[0].metadata).toHaveProperty("statusCode");
    expect(response.data?.[0].metadata).toHaveProperty("error");
  }, 35000); // 35 seconds timeout
});
