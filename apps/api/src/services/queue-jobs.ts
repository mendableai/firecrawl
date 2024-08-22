import { Job, Queue } from "bullmq";
import { getScrapeQueue } from "./queue-service";
import { v4 as uuidv4 } from "uuid";
import { WebScraperOptions } from "../types";

export async function addScrapeJob(
  webScraperOptions: WebScraperOptions,
  options: any = {},
  jobId: string = uuidv4(),
  jobPriority: number = 10
): Promise<Job> {
  return await getScrapeQueue().add(jobId, webScraperOptions, {
    priority: jobPriority,
    ...options,
    jobId,
  });
}



