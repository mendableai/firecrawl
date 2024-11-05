import { Job, JobsOptions } from "bullmq";
import { getScrapeQueue } from "./queue-service";
import { v4 as uuidv4 } from "uuid";
import { WebScraperOptions } from "../types";
import * as Sentry from "@sentry/node";
import { cleanOldConcurrencyLimitEntries, getConcurrencyLimitActiveJobs, getConcurrencyLimitMax, pushConcurrencyLimitActiveJob, pushConcurrencyLimitedJob } from "../lib/concurrency-limit";

async function addScrapeJobRaw(
  webScraperOptions: any,
  options: any,
  jobId: string,
  jobPriority: number = 10
) {
  let concurrencyLimited = false;

  if (webScraperOptions && webScraperOptions.team_id && webScraperOptions.plan) {
    const now = Date.now();
    const limit = await getConcurrencyLimitMax(webScraperOptions.plan);
    cleanOldConcurrencyLimitEntries(webScraperOptions.team_id, now);
    concurrencyLimited = (await getConcurrencyLimitActiveJobs(webScraperOptions.team_id, now)).length >= limit;
  }

  if (concurrencyLimited) {
    await pushConcurrencyLimitedJob(webScraperOptions.team_id, {
      id: jobId,
      data: webScraperOptions,
      opts: {
        ...options,
        priority: jobPriority,
        jobId: jobId,
      },
      priority: jobPriority,
    });
  } else {
    if (webScraperOptions && webScraperOptions.team_id && webScraperOptions.plan) {
      await pushConcurrencyLimitActiveJob(webScraperOptions.team_id, jobId);
    }

    await getScrapeQueue().add(jobId, webScraperOptions, {
      ...options,
      priority: jobPriority,
      jobId,
    });
  }
}

export async function addScrapeJob(
  webScraperOptions: WebScraperOptions,
  options: any = {},
  jobId: string = uuidv4(),
  jobPriority: number = 10
) {
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
      await addScrapeJobRaw({
        ...webScraperOptions,
        sentry: {
          trace: Sentry.spanToTraceHeader(span),
          baggage: Sentry.spanToBaggageHeader(span),
          size,
        },
      }, options, jobId, jobPriority);
    });
  } else {
    await addScrapeJobRaw(webScraperOptions, options, jobId, jobPriority);
  }
}

export async function addScrapeJobs(
  jobs: {
    data: WebScraperOptions,
    opts: {
      jobId: string,
      priority: number,
    },
  }[],
) {
  // TODO: better
  await Promise.all(jobs.map(job => addScrapeJob(job.data, job.opts, job.opts.jobId, job.opts.priority)));
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
          const job = await getScrapeQueue().getJob(jobId);
          if (job && job.failedReason !== "Concurrency limit hit") {
            clearInterval(int);
            reject(job.failedReason);
          }
        }
      }
    }, 500);
  })
}
