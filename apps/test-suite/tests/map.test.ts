import request from "supertest";
import dotenv from "dotenv";
import { WebsiteScrapeError } from "../utils/types";
import { logErrors } from "../utils/log";

import websitesData from "../data/map.json";
import "dotenv/config";

import fs from 'fs';
dotenv.config();

const TEST_URL = "http://127.0.0.1:3002";

describe("Map Checkup (E2E)", () => {
  beforeAll(() => {
    if (!process.env.TEST_API_KEY) {
      throw new Error("TEST_API_KEY is not set");
    }
  });

  describe("Map website tests with a dataset", () => {
    it("Should map the website and verify the response", async () => {
      let passedTests = 0;
      const startTime = new Date().getTime();
      const date = new Date();
      const logsDir = `logs/${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
      
      let errorLogFileName = `${logsDir}/run.log_${new Date().toTimeString().split(' ')[0]}`;
      const errorLog: WebsiteScrapeError[] = [];
      
      for (const websiteData of websitesData) {
        try {
          const mapResponse = await request(TEST_URL || "")
            .post("/v1/map")
            .set("Content-Type", "application/json")
            .set("Authorization", `Bearer ${process.env.TEST_API_KEY}`)
            .send({ url: websiteData.website, limit: 100 });

          // check how many webpages were mapped successfully
          // compares with expected_num_of_pages
          if (mapResponse.body.links.length < websiteData.expected_min_num_of_pages) {
            errorLog.push({
              website: websiteData.website,
              prompt: 'MAP',
              expected_output: `SUCCESS: ${websiteData.expected_min_num_of_pages}`,
              actual_output: `FAILURE: ${mapResponse.body.links.length}`,
              error: `Expected at least ${websiteData.expected_min_num_of_pages} webpages, but got ${mapResponse.body.links.length}`
            });
            console.log('Error: ', errorLog);
            continue;
          }

          // checks if mapped pages contain expected_mapped_pages
          if (websiteData.expected_mapped_pages && websiteData.expected_mapped_pages.length > 0 && websiteData.expected_mapped_pages.some(page => !mapResponse.body.links?.some((d: { url: string }) => d.url === page))) {
            errorLog.push({
              website: websiteData.website,
              prompt: 'MAP',
              expected_output: `SUCCESS: ${websiteData.expected_mapped_pages}`,
              actual_output: `FAILURE: ${mapResponse.body.links.map((d: { url: string }) => d.url)}`,
              error: `Expected mapped pages to contain ${websiteData.expected_mapped_pages}, but got ${mapResponse.body.links.map((d: { url: string }) => d.url)}`
            });
            console.log('Error: ', errorLog);
            continue;
          }

          // checks if mapped pages not contain expected_not_mapped_pages
          if (websiteData.expected_not_mapped_pages && websiteData.expected_not_mapped_pages.length > 0 && mapResponse.body.links && websiteData.expected_not_mapped_pages.filter(page => mapResponse.body.links.some((d: { url: string }) => d.url === page)).length > 0) {
            errorLog.push({
              website: websiteData.website,
              prompt: 'MAP',
              expected_output: `SUCCESS: ${websiteData.expected_not_mapped_pages}`,
              actual_output: `FAILURE: ${mapResponse.body.links.map((d: { url: string }) => d.url)}`,
              error: `Expected mapped pages to not contain ${websiteData.expected_not_mapped_pages}, but got ${mapResponse.body.links.map((d: { url: string }) => d.url)}`
            });
            console.log('Error: ', errorLog);
            continue;
          }

          passedTests++;
        } catch (error) {
          console.error(`Error processing ${websiteData.website}: ${error}`);
          errorLog.push({
            website: websiteData.website,
            prompt: 'MAP',
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
