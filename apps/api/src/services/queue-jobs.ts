import { Job, Queue } from "bullmq";
import { getCrawlPreQueue, getScrapeQueue } from "./queue-service";
import { v4 as uuidv4 } from "uuid";
import { WebScraperOptions } from "../types";
import * as Sentry from "@sentry/node";
import { AuthObject } from "../controllers/v1/types";

async function addScrapeJobRaw(
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

export async function addScrapeJob(
  webScraperOptions: WebScraperOptions,
  options: any = {},
  jobId: string = uuidv4(),
  jobPriority: number = 10
): Promise<Job> {
  
  if (Sentry.isInitialized()) {
    const size = JSON.stringify(webScraperOptions).length;
    return await Sentry.startSpan({
      name: "Add scrape job",
      op: "queue.publish",
      attributes: {
        "messaging.message.id": jobId,
        "messaging.destination.name": getScrapeQueue().name,
        "messaging.message.body.size": size,
      },
    }, async (span) => {
      return await addScrapeJobRaw({
        ...webScraperOptions,
        sentry: {
          trace: Sentry.spanToTraceHeader(span),
          baggage: Sentry.spanToBaggageHeader(span),
          size,
        },
      }, options, jobId, jobPriority);
    });
  } else {
    return await addScrapeJobRaw(webScraperOptions, options, jobId, jobPriority);
  }
}

async function addCrawlPreJobRaw(
  data: any,
  jobId: string,
): Promise<Job> {
  return await getCrawlPreQueue().add(jobId, data, {
    jobId,
  });
}

export async function addCrawlPreJob(
  data: {
    auth: AuthObject,
    crawlerOptions: any,
    pageOptions: any,
    webhook?: string, // req.body.webhook
    url: string, // req.body.url
    sentry?: any,
  },
  jobId: string,
): Promise<Job> {
  
  if (Sentry.isInitialized()) {
    const size = JSON.stringify(data).length;
    return await Sentry.startSpan({
      name: "Add crawl pre job",
      op: "queue.publish",
      attributes: {
        "messaging.message.id": jobId,
        "messaging.destination.name": getCrawlPreQueue().name,
        "messaging.message.body.size": size,
      },
    }, async (span) => {
      return await addCrawlPreJobRaw({
        ...data,
        sentry: {
          trace: Sentry.spanToTraceHeader(span),
          baggage: Sentry.spanToBaggageHeader(span),
          size,
        },
      }, jobId);
    });
  } else {
    return await addCrawlPreJobRaw(data, jobId);
  }
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
  })
}
