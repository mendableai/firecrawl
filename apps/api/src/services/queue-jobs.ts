import { Job, Queue } from "bullmq";
import {
  getScrapeQueue,
  getWebScraperQueue,
} from "./queue-service";
import { v4 as uuidv4 } from "uuid";
import { WebScraperOptions } from "../types";

export async function addWebScraperJob(
  webScraperOptions: WebScraperOptions,
  options: any = {},
  jobId: string = uuidv4(),
): Promise<Job> {
  return await getWebScraperQueue().add(jobId, webScraperOptions, {
    ...options,
    jobId,
  });
}

export async function addScrapeJob(
  webScraperOptions: WebScraperOptions,
  options: any = {},
  jobId: string = uuidv4(),
): Promise<Job> {
  return await getScrapeQueue().add(jobId, webScraperOptions, {
    ...options,
    jobId,
  });
}

