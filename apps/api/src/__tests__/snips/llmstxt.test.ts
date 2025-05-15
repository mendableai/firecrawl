import { configDotenv } from "dotenv";
configDotenv();

import request from "supertest";

const TEST_URL = "http://127.0.0.1:3002";

async function generateLLMsText(url, options = {}) {
  const defaultOptions = {
    maxUrls: 1,
    showFullText: false,
    bypassCache: false
  };
  
  const requestOptions = { ...defaultOptions, ...options, url };
  
  const response = await request(TEST_URL)
    .post("/v1/llmstxt")
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
    .set("Content-Type", "application/json")
    .send(requestOptions);
    
  return response;
}

async function getLLMsTextStatus(id) {
  return await request(TEST_URL)
    .get(`/v1/llmstxt/${id}`)
    .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);
}

describe("LLMs.txt cache tests", () => {
  it.concurrent("should generate different results for different subdomains", async () => {
    const response1 = await generateLLMsText("https://domain1.example.com");
    expect(response1.statusCode).toBe(200);
    expect(response1.body.success).toBe(true);
    
    const response2 = await generateLLMsText("https://domain2.example.com");
    expect(response2.statusCode).toBe(200);
    expect(response2.body.success).toBe(true);
    
    const id1 = response1.body.id;
    const id2 = response2.body.id;
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const statusResponse1 = await getLLMsTextStatus(id1);
    const statusResponse2 = await getLLMsTextStatus(id2);
      
    expect(statusResponse1.body.data.generatedText).not.toEqual(statusResponse2.body.data.generatedText);
  }, 30000);
  
  it.concurrent("should bypass cache when bypassCache=true is specified", async () => {
    const response1 = await generateLLMsText("https://example.com");
    expect(response1.statusCode).toBe(200);
    
    const response2 = await generateLLMsText("https://example.com", { bypassCache: true });
    expect(response2.statusCode).toBe(200);
    
    expect(response1.body.id).not.toEqual(response2.body.id);
  }, 30000);
});
