import request from "supertest";
import dotenv from "dotenv";
import { WebsiteScrapeError } from "../utils/types";
import { logErrors } from "../utils/log";

import websitesData from "../data/crawl.json";
import "dotenv/config";

import fs from 'fs';
dotenv.config();

interface WebsiteData {
  website: string;
  expected_min_num_of_pages: number;
  expected_crawled_pages: string[];
}

const TEST_URL = "http://127.0.0.1:3002";

describe("Crawling Checkup (E2E)", () => {
  beforeAll(() => {
    if (!process.env.TEST_API_KEY) {
      throw new Error("TEST_API_KEY is not set");
    }
  });

  describe("Crawling website tests with a dataset", () => {
    it("Should crawl the website and verify the response", async () => {
      let passedTests = 0;
      const startTime = new Date().getTime();
      const date = new Date();
      const logsDir = `logs/${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
      
      let errorLogFileName = `${logsDir}/run.log_${new Date().toTimeString().split(' ')[0]}`;
      const errorLog: WebsiteScrapeError[] = [];
      
      for (const websiteData of websitesData) {
        try {
          const crawlResponse = await request(TEST_URL || "")
            .post("/v0/crawl")
            .set("Content-Type", "application/json")
            .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
            .send({ url: websiteData.website, pageOptions: { onlyMainContent: true }, crawlerOptions: { limit: 100, returnOnlyUrls: true }});

          const jobId = crawlResponse.body.jobId;
          let completedResponse: any;
          let isFinished = false;

          while (!isFinished) {
            completedResponse = await request(TEST_URL)
              .get(`/v0/crawl/status/${jobId}`)
              .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`);

            isFinished = completedResponse.body.status === "completed";

            if (!isFinished) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before checking again
            }
          }

          if(!completedResponse) {
            // fail the test
            console.log('No response');
            continue;
            // continue;
          }

          if (!completedResponse.body || completedResponse.body.status !== "completed") {
            errorLog.push({
              website: websiteData.website,
              prompt: 'CRAWL',
              expected_output: 'SUCCESS',
              actual_output: 'FAILURE',
              error: `Crawl job did not complete successfully.`
            });
            continue;
          }

          // check how many webpages were crawled successfully
          // compares with expected_num_of_pages
          if (completedResponse.body.data.length < websiteData.expected_min_num_of_pages) {
            errorLog.push({
              website: websiteData.website,
              prompt: 'CRAWL',
              expected_output: `SUCCESS: ${websiteData.expected_min_num_of_pages}`,
              actual_output: `FAILURE: ${completedResponse.body.data.length}`,
              error: `Expected at least ${websiteData.expected_min_num_of_pages} webpages, but got ${completedResponse.body.data.length}`
            });
            console.log('Error: ', errorLog);
            continue;
          }

          // checks if crawled pages contain expected_crawled_pages
          if (websiteData.expected_crawled_pages && websiteData.expected_crawled_pages.length > 0 && websiteData.expected_crawled_pages.some(page => !completedResponse.body.data?.some((d: { url: string }) => d.url === page))) {
            errorLog.push({
              website: websiteData.website,
              prompt: 'CRAWL',
              expected_output: `SUCCESS: ${websiteData.expected_crawled_pages}`,
              actual_output: `FAILURE: ${completedResponse.body.data.map((d: { url: string }) => d.url)}`,
              error: `Expected crawled pages to contain ${websiteData.expected_crawled_pages}, but got ${completedResponse.body.data.map((d: { url: string }) => d.url)}`
            });
            console.log('Error: ', errorLog);
            continue;
          }

          // checks if crawled pages not contain expected_not_crawled_pages
          if (websiteData.expected_not_crawled_pages && websiteData.expected_not_crawled_pages.length > 0 && completedResponse.body.data && websiteData.expected_not_crawled_pages.filter(page => completedResponse.body.data.some((d: { url: string }) => d.url === page)).length > 0) {
            errorLog.push({
              website: websiteData.website,
              prompt: 'CRAWL',
              expected_output: `SUCCESS: ${websiteData.expected_not_crawled_pages}`,
              actual_output: `FAILURE: ${completedResponse.body.data.map((d: { url: string }) => d.url)}`,
              error: `Expected crawled pages to not contain ${websiteData.expected_not_crawled_pages}, but got ${completedResponse.body.data.map((d: { url: string }) => d.url)}`
            });
            console.log('Error: ', errorLog);
            continue;
          }

          passedTests++;
        } catch (error) {
          console.error(`Error processing ${websiteData.website}: ${error}`);
          errorLog.push({
            website: websiteData.website,
            prompt: 'CRAWL',
            expected_output: 'SUCCESS',
            actual_output: 'FAILURE',
            error: `Error processing ${websiteData.website}: ${error}`
          });
          continue;
        }
      }

      const score = (passedTests / websitesData.length) * 100;
      const endTime = new Date().getTime();
      const timeTaken = (endTime - startTime) / 1000;
      console.log(`Score: ${score}%`);

      await logErrors(errorLog, timeTaken, 0, score, websitesData.length);
      
      if (process.env.ENV === "local" && errorLog.length > 0) {
        if (!fs.existsSync(logsDir)){
          fs.mkdirSync(logsDir, { recursive: true });
        }
        fs.writeFileSync(errorLogFileName, JSON.stringify(errorLog, null, 2));
      }

      expect(score).toBeGreaterThanOrEqual(90);
    }, 350000); // 150 seconds timeout
  });
});
