import { Job } from "bullmq";
import { getScrapeQueue } from "./queue-service";

export async function addScrapeJobRaw(
  webScraperOptions: any,
  options: any,
  jobId: string,
  jobPriority: number = 10
): Promise<Job> {
  return await getScrapeQueue().add(jobId, webScraperOptions, {
    ...options,
    priority: jobPriority,
    jobId,
  });
}

export function waitForJob(jobId: string, timeout: number) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const int = setInterval(async () => {
      if (Date.now() >= start + timeout) {
        clearInterval(int);
        reject(new Error("Job wait "));
      } else {
        const state = await getScrapeQueue().getJobState(jobId);
        if (state === "completed") {
          clearInterval(int);
          resolve((await getScrapeQueue().getJob(jobId)).returnvalue);
        } else if (state === "failed") {
          // console.log("failed", (await getScrapeQueue().getJob(jobId)).failedReason);
          clearInterval(int);
          reject((await getScrapeQueue().getJob(jobId)).failedReason);
        }
      }
    }, 500);
  });
}
