import { configDotenv } from "dotenv";
configDotenv();

import request from "supertest";

const TEST_URL = "http://127.0.0.1:3002";

describe("LLMs.txt cache tests", () => {
  it("should generate different results for different subdomains", async () => {
    const response1 = await request(TEST_URL)
      .post("/v1/llmstxt")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://domain1.example.com",
        maxUrls: 1,
        showFullText: false
      });

    expect(response1.statusCode).toBe(200);
    expect(response1.body.success).toBe(true);
    
    const response2 = await request(TEST_URL)
      .post("/v1/llmstxt")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://domain2.example.com",
        maxUrls: 1,
        showFullText: false
      });

    expect(response2.statusCode).toBe(200);
    expect(response2.body.success).toBe(true);
    
    const id1 = response1.body.id;
    const id2 = response2.body.id;
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse1 = await request(TEST_URL)
      .get(`/v1/llmstxt/${id1}`)
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
      
    const statusResponse2 = await request(TEST_URL)
      .get(`/v1/llmstxt/${id2}`)
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
      
    expect(statusResponse1.body.data.generatedText).not.toEqual(statusResponse2.body.data.generatedText);
  }, 15000);
  
  it("should bypass cache when bypassCache=true is specified", async () => {
    const response1 = await request(TEST_URL)
      .post("/v1/llmstxt")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://example.com",
        maxUrls: 1,
        showFullText: false
      });

    expect(response1.statusCode).toBe(200);
    
    const response2 = await request(TEST_URL)
      .post("/v1/llmstxt")
      .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
      .set("Content-Type", "application/json")
      .send({
        url: "https://example.com",
        maxUrls: 1,
        showFullText: false,
        bypassCache: true
      });

    expect(response2.statusCode).toBe(200);
    
    expect(response1.body.id).not.toEqual(response2.body.id);
  }, 15000);
});
