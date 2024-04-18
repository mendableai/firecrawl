import request from 'supertest';
import { app } from '../../index';
import dotenv from 'dotenv';

dotenv.config();
const TEST_URL = 'http://localhost:3002'

describe('E2E Tests for API Routes', () => {
  describe('GET /', () => {
    it('should return Hello, world! message', async () => {
      const response = await request(TEST_URL).get('/');
      expect(response.statusCode).toBe(200);
      expect(response.text).toContain('SCRAPERS-JS: Hello, world! Fly.io');
    });
  });

  describe('GET /test', () => {
    it('should return Hello, world! message', async () => {
      const response = await request(TEST_URL).get('/test');
      expect(response.statusCode).toBe(200);
      expect(response.text).toContain('Hello, world!');
    });
  });

  describe('POST /v0/scrape', () => {
    it('should require authorization', async () => {
      const response = await request(app).post('/v0/scrape');
      expect(response.statusCode).toBe(401);
    });

    it('should return an error response with an invalid API key', async () => {
      const response = await request(TEST_URL)
        .post('/v0/scrape')
        .set('Authorization', `Bearer invalid-api-key`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://firecrawl.dev' });
      expect(response.statusCode).toBe(401);
    });

    it('should return a successful response with a valid API key', async () => {
      const response = await request(TEST_URL)
        .post('/v0/scrape')
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://firecrawl.dev' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('content');
      expect(response.body.data).toHaveProperty('markdown');
      expect(response.body.data).toHaveProperty('metadata');
      expect(response.body.data.content).toContain('🔥 FireCrawl');
    }, 30000); // 30 seconds timeout
  });

  describe('POST /v0/crawl', () => {
    it('should require authorization', async () => {
      const response = await request(TEST_URL).post('/v0/crawl');
      expect(response.statusCode).toBe(401);
    });

    it('should return an error response with an invalid API key', async () => {
      const response = await request(TEST_URL)
        .post('/v0/crawl')
        .set('Authorization', `Bearer invalid-api-key`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://firecrawl.dev' });
        expect(response.statusCode).toBe(401);
    });

    it('should return a successful response with a valid API key', async () => {
      const response = await request(TEST_URL)
        .post('/v0/crawl')
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://firecrawl.dev' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('jobId');
      expect(response.body.jobId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/);
    });

    // Additional tests for insufficient credits?
  });

  describe('POST /v0/crawlWebsitePreview', () => {
    it('should require authorization', async () => {
      const response = await request(TEST_URL).post('/v0/crawlWebsitePreview');
      expect(response.statusCode).toBe(401);
    });

    it('should return an error response with an invalid API key', async () => {
      const response = await request(TEST_URL)
        .post('/v0/crawlWebsitePreview')
        .set('Authorization', `Bearer invalid-api-key`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://firecrawl.dev' });
      expect(response.statusCode).toBe(401);
    });

    it('should return a successful response with a valid API key', async () => {
      const response = await request(TEST_URL)
        .post('/v0/crawlWebsitePreview')
        .set('Authorization', `Bearer this_is_just_a_preview_token`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://firecrawl.dev' });
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('jobId');
      expect(response.body.jobId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/);
    });
  });

  describe('GET /v0/crawl/status/:jobId', () => {
    it('should require authorization', async () => {
      const response = await request(TEST_URL).get('/v0/crawl/status/123');
      expect(response.statusCode).toBe(401);
    });

    it('should return an error response with an invalid API key', async () => {
      const response = await request(TEST_URL)
        .get('/v0/crawl/status/123')
        .set('Authorization', `Bearer invalid-api-key`);
      expect(response.statusCode).toBe(401);
    });

    it('should return Job not found for invalid job ID', async () => {
      const response = await request(TEST_URL)
        .get('/v0/crawl/status/invalidJobId')
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`);
      expect(response.statusCode).toBe(404);
    });

    it('should return a successful response for a valid crawl job', async () => {
      const crawlResponse = await request(TEST_URL)
        .post('/v0/crawl')
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`)
        .set('Content-Type', 'application/json')
        .send({ url: 'https://firecrawl.dev' });
      expect(crawlResponse.statusCode).toBe(200);


      const response = await request(TEST_URL)
        .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body.status).toBe('active');

      setTimeout(async () => {
        const response = await request(TEST_URL)
        .get(`/v0/crawl/status/${crawlResponse.body.jobId}`)
        .set('Authorization', `Bearer ${process.env.TEST_API_KEY}`);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body.status).toBe('completed');
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('content');
        expect(response.body.data).toHaveProperty('markdown');
        expect(response.body.data).toHaveProperty('metadata');
        expect(response.body.data.content).toContain('🔥 FireCrawl');
      }, 30000); // 30 seconds
    }, 60000); // 60 seconds
  });

  describe('GET /is-production', () => {
    it('should return the production status', async () => {
      const response = await request(TEST_URL).get('/is-production');
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('isProduction');
    });
  });
});