import { deepResearch } from "./lib";
import { describe, it, expect } from "@jest/globals";

describe("Deep Research API", () => {
  if (!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY) {
    it.concurrent("should respect maxUrls parameter", async () => {
      const response = await deepResearch({
        query: "javascript programming",
        maxDepth: 2,
        maxUrls: 3, // Small limit for testing
        timeLimit: 180,
      });
      
      expect(response.totalUrls).toBeLessThanOrEqual(3);
      expect(response.sources.length).toBeLessThanOrEqual(3);
    }, 300000); // Longer timeout for deep research
    
    it.concurrent("should respect timeLimit parameter", async () => {
      const startTime = Date.now();
      
      const response = await deepResearch({
        query: "artificial intelligence",
        maxDepth: 2,
        maxUrls: 10,
        timeLimit: 180, // 3 minutes
      });
      
      const endTime = Date.now();
      const elapsedTimeSeconds = (endTime - startTime) / 1000;
      
      const maxAllowedTime = 180 * 1.1;
      
      expect(elapsedTimeSeconds).toBeLessThanOrEqual(maxAllowedTime);
      expect(response.status).toBe("completed");
    }, 300000); // Longer timeout for deep research
  }
});
