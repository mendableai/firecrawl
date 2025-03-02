import { configDotenv } from "dotenv";
configDotenv();

import { ScrapeRequestInput, Document, ExtractRequestInput, ExtractResponse, CrawlRequestInput, MapRequestInput, BatchScrapeRequestInput, SearchRequestInput } from "../../controllers/v1/types";
import request from "supertest";

// =========================================
// Configuration
// =========================================

const TEST_URL = "http://127.0.0.1:3002";

// =========================================
// Scrape API
// =========================================

async function scrapeRaw(body: ScrapeRequestInput) {
    return await request(TEST_URL)
        .post("/v1/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(body);
}

function expectScrapeToSucceed(response: Awaited<ReturnType<typeof scrapeRaw>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.data).toBe("object");
}

export async function scrape(body: ScrapeRequestInput): Promise<Document> {
    const raw = await scrapeRaw(body);
    expectScrapeToSucceed(raw);
    return raw.body.data;
}

// =========================================
// Crawl API
// =========================================

async function crawlStart(body: CrawlRequestInput) {
    return await request(TEST_URL)
        .post("/v1/crawl")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(body);
}

async function crawlStatus(id: string) {
    return await request(TEST_URL)
        .get("/v1/crawl/" + encodeURIComponent(id))
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .send();
}

function expectCrawlStartToSucceed(response: Awaited<ReturnType<typeof crawlStart>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.id).toBe("string");
}

function expectCrawlToSucceed(response: Awaited<ReturnType<typeof crawlStatus>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.status).toBe("string");
    expect(response.body.status).toBe("completed");
    expect(response.body).toHaveProperty("data");
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
}

export async function crawl(body: CrawlRequestInput): ReturnType<typeof crawlStatus> {
    const cs = await crawlStart(body);
    expectCrawlStartToSucceed(cs);

    let x;

    do {
        x = await crawlStatus(cs.body.id);
        expect(x.statusCode).toBe(200);
        expect(typeof x.body.status).toBe("string");
    } while (x.body.status === "scraping");

    expectCrawlToSucceed(x);
    return x;
}

// =========================================
// Batch Scrape API
// =========================================

async function batchScrapeStart(body: BatchScrapeRequestInput) {
    return await request(TEST_URL)
        .post("/v1/batch/scrape")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(body);
}

async function batchScrapeStatus(id: string) {
    return await request(TEST_URL)
        .get("/v1/batch/scrape/" + encodeURIComponent(id))
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .send();
}

function expectBatchScrapeStartToSucceed(response: Awaited<ReturnType<typeof batchScrape>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.id).toBe("string");
}

function expectBatchScrapeToSucceed(response: Awaited<ReturnType<typeof batchScrapeStatus>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.status).toBe("string");
    expect(response.body.status).toBe("completed");
    expect(response.body).toHaveProperty("data");
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
}

export async function batchScrape(body: BatchScrapeRequestInput): ReturnType<typeof batchScrapeStatus> {
    const bss = await batchScrapeStart(body);
    expectBatchScrapeStartToSucceed(bss);

    let x;

    do {
        x = await batchScrapeStatus(bss.body.id);
        expect(x.statusCode).toBe(200);
        expect(typeof x.body.status).toBe("string");
    } while (x.body.status === "scraping");

    expectBatchScrapeToSucceed(x);
    return x;
}

// =========================================
// Map API
// =========================================

export async function map(body: MapRequestInput) {
    return await request(TEST_URL)
        .post("/v1/map")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(body);
}

export function expectMapToSucceed(response: Awaited<ReturnType<typeof map>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.links)).toBe(true);
    expect(response.body.links.length).toBeGreaterThan(0);
}

// =========================================
// Extract API
// =========================================

async function extractStart(body: ExtractRequestInput) {
    return await request(TEST_URL)
        .post("/v1/extract")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(body);
}

async function extractStatus(id: string) {
    return await request(TEST_URL)
        .get("/v1/extract/" + encodeURIComponent(id))
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .send();
}


function expectExtractStartToSucceed(response: Awaited<ReturnType<typeof extractStart>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.id).toBe("string");
}

function expectExtractToSucceed(response: Awaited<ReturnType<typeof extractStatus>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.status).toBe("string");
    expect(response.body.status).toBe("completed");
    expect(response.body).toHaveProperty("data");
}

export async function extract(body: ExtractRequestInput): Promise<ExtractResponse> {
    const es = await extractStart(body);
    expectExtractStartToSucceed(es);

    let x;

    do {
        x = await extractStatus(es.body.id);
        expect(x.statusCode).toBe(200);
        expect(typeof x.body.status).toBe("string");
    } while (x.body.status === "processing");

    expectExtractToSucceed(x);
    return x.body;
}

// =========================================
// Search API
// =========================================

async function searchRaw(body: SearchRequestInput) {
    return await request(TEST_URL)
        .post("/v1/search")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")
        .send(body);
}

function expectSearchToSucceed(response: Awaited<ReturnType<typeof searchRaw>>) {
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.data).toBe("object");
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
}

export async function search(body: SearchRequestInput): Promise<Document[]> {
    const raw = await searchRaw(body);
    expectSearchToSucceed(raw);
    return raw.body.data;
}

// =========================================
// Billing API
// =========================================

export async function creditUsage(): Promise<{ remaining_credits: number }> {
    return (await request(TEST_URL)
        .get("/v1/team/credit-usage")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")).body.data;
}

export async function tokenUsage(): Promise<{ remaining_tokens: number }> {
    return (await request(TEST_URL)
        .get("/v1/team/token-usage")
        .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
        .set("Content-Type", "application/json")).body.data;
}
