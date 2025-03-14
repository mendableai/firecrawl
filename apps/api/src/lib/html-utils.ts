import { v4 as uuidv4 } from "uuid";
import { addScrapeJob } from "../services/queue-jobs";
import { getScrapeQueue } from "../services/queue-service";
import { logger } from "./logger";
import { ScrapeOptions } from "../controllers/v1/types";

/**
 * Fetches the HTML content from a given URL.
 * 
 * This function handles all the complexity of creating a job, adding it to the queue, 
 * and waiting for the result.
 * 
 * @param url - The URL to fetch HTML from
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns A Promise that resolves to the HTML content as a string
 */
export async function getHtmlFromUrl(url: string, timeout: number = 30000): Promise<string> {
  const jobId = uuidv4();
  
  try {
    // Create proper scrape options
    const scrapeOpts: ScrapeOptions = {
      formats: ["rawHtml"],
      onlyMainContent: true,
      waitFor: 0,
      mobile: false,
      parsePDF: true,
      timeout,
      excludeTags: [],
      includeTags: [],
      actions: [],
      skipTlsVerification: false,
      removeBase64Images: true,
      fastMode: false,
      blockAds: true,
      headers: {},
      proxy: "basic"
    };

    // Add the job to the queue with minimal configuration
    await addScrapeJob(
      {
        url,
        mode: "single_urls",
        team_id: process.env.SYSTEM_TEAM_ID || "system", // Use a system team ID for internal usage
        scrapeOptions: scrapeOpts,
        internalOptions: {},
        plan: "system",
        origin: "internal-api",
        is_scrape: true,
      },
      {},
      jobId,
      10
    );
    
    // Wait for the job to complete
    const result = await waitForJobResult(jobId, timeout);
    
    // Return the HTML content
    return result.rawHtml;
  } catch (error) {
    logger.error(`Error fetching HTML from ${url}:`, { error, jobId });
    throw new Error(`Failed to fetch HTML from ${url}: ${error.message}`);
  } finally {
    // Clean up the job regardless of outcome
    try {
      await getScrapeQueue().remove(jobId);
    } catch (cleanupError) {
      logger.warn(`Failed to clean up job ${jobId}:`, { error: cleanupError });
    }
  }
}

/**
 * Waits for a job to complete and returns its result.
 * 
 * @param jobId - The ID of the job to wait for
 * @param timeout - Maximum time to wait in milliseconds
 * @returns The job's return value
 */
async function waitForJobResult(jobId: string, timeout: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(async () => {
      try {
        if (Date.now() >= start + timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for job ${jobId} to complete`));
          return;
        }
        
        const job = await getScrapeQueue().getJob(jobId);
        if (!job) {
          clearInterval(interval);
          reject(new Error(`Job ${jobId} not found`));
          return;
        }
        
        const state = await job.getState();
        
        if (state === "completed") {
          clearInterval(interval);
          resolve(job.returnvalue);
        } else if (state === "failed") {
          clearInterval(interval);
          reject(new Error(job.failedReason || "Job failed without a reason"));
        }
      } catch (error) {
        clearInterval(interval);
        reject(error);
      }
    }, 250);
  });
} 