import { Job, JobsOptions } from "bullmq";
import { getScrapeQueue } from "./queue-service";
import { v4 as uuidv4 } from "uuid";
import { NotificationType, PlanType, WebScraperOptions } from "../types";
import * as Sentry from "@sentry/node";
import {
  calculateJobTimeToRun,
  cleanOldConcurrencyLimitEntries,
  getConcurrencyLimitActiveJobs,
  getConcurrencyQueueJobsCount,
  pushConcurrencyLimitActiveJob,
  pushConcurrencyLimitedJob,
} from "../lib/concurrency-limit";
import { logger } from "../lib/logger";
import { getConcurrencyLimitMax } from "./rate-limiter";
import { sendNotificationWithCustomDays } from "./notification/email_notification";

async function _addScrapeJobToConcurrencyQueue(
  webScraperOptions: any,
  options: any,
  jobId: string,
  jobPriority: number,
) {
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
}

export async function _addScrapeJobToBullMQ(
  webScraperOptions: any,
  options: any,
  jobId: string,
  jobPriority: number,
) {
  if (
    webScraperOptions &&
    webScraperOptions.team_id &&
    webScraperOptions.plan
  ) {
    await pushConcurrencyLimitActiveJob(webScraperOptions.team_id, jobId, calculateJobTimeToRun({
      id: jobId,
      opts: {
        ...options,
        priority: jobPriority,
        jobId,
      },
      data: webScraperOptions,
    }));
  }

  await getScrapeQueue().add(jobId, webScraperOptions, {
    ...options,
    priority: jobPriority,
    jobId,
  });
}

async function addScrapeJobRaw(
  webScraperOptions: any,
  options: any,
  jobId: string,
  jobPriority: number,
) {
  let concurrencyLimited = false;
  let currentActiveConcurrency = 0;
  let maxConcurrency = 0;

  if (
    webScraperOptions &&
    webScraperOptions.team_id
  ) {
    const now = Date.now();
    maxConcurrency = getConcurrencyLimitMax(webScraperOptions.plan ?? "free", webScraperOptions.team_id);
    cleanOldConcurrencyLimitEntries(webScraperOptions.team_id, now);
    currentActiveConcurrency = (await getConcurrencyLimitActiveJobs(webScraperOptions.team_id, now)).length;
    concurrencyLimited = currentActiveConcurrency >= maxConcurrency;
  }

  const concurrencyQueueJobs = await getConcurrencyQueueJobsCount(webScraperOptions.team_id);

  if (concurrencyLimited) {
    // Detect if they hit their concurrent limit
    // If above by 2x, send them an email
    // No need to 2x as if there are more than the max concurrency in the concurrency queue, it is already 2x
    if(concurrencyQueueJobs > maxConcurrency) {
      logger.info("Concurrency limited 2x (single) - ", "Concurrency queue jobs: ", concurrencyQueueJobs, "Max concurrency: ", maxConcurrency);
      // sendNotificationWithCustomDays(webScraperOptions.team_id, NotificationType.CONCURRENCY_LIMIT_REACHED, 10, false).catch((error) => {
      //   logger.error("Error sending notification (concurrency limit reached): ", error);
      // });
    }

    await _addScrapeJobToConcurrencyQueue(
      webScraperOptions,
      options,
      jobId,
      jobPriority,
    );
  } else {
    await _addScrapeJobToBullMQ(webScraperOptions, options, jobId, jobPriority);
  }
}

export async function addScrapeJob(
  webScraperOptions: WebScraperOptions,
  options: any = {},
  jobId: string = uuidv4(),
  jobPriority: number = 10,
) {
  if (Sentry.isInitialized()) {
    const size = JSON.stringify(webScraperOptions).length;
    return await Sentry.startSpan(
      {
        name: "Add scrape job",
        op: "queue.publish",
        attributes: {
          "messaging.message.id": jobId,
          "messaging.destination.name": getScrapeQueue().name,
          "messaging.message.body.size": size,
        },
      },
      async (span) => {
        await addScrapeJobRaw(
          {
            ...webScraperOptions,
            sentry: {
              trace: Sentry.spanToTraceHeader(span),
              baggage: Sentry.spanToBaggageHeader(span),
              size,
            },
          },
          options,
          jobId,
          jobPriority,
        );
      },
    );
  } else {
    await addScrapeJobRaw(webScraperOptions, options, jobId, jobPriority);
  }
}

export async function addScrapeJobs(
  jobs: {
    data: WebScraperOptions;
    opts: {
      jobId: string;
      priority: number;
    };
  }[],
) {
  if (jobs.length === 0) return true;

  let countCanBeDirectlyAdded = Infinity;
  let currentActiveConcurrency = 0;
  let maxConcurrency = 0;

  if (jobs[0].data && jobs[0].data.team_id && jobs[0].data.plan) {
    const now = Date.now();
    maxConcurrency = getConcurrencyLimitMax(jobs[0].data.plan as PlanType, jobs[0].data.team_id);
    cleanOldConcurrencyLimitEntries(jobs[0].data.team_id, now);

    currentActiveConcurrency = (await getConcurrencyLimitActiveJobs(jobs[0].data.team_id, now)).length;

    countCanBeDirectlyAdded = Math.max(
      maxConcurrency - currentActiveConcurrency,
      0,
    );
  }

  const addToBull = jobs.slice(0, countCanBeDirectlyAdded);
  const addToCQ = jobs.slice(countCanBeDirectlyAdded);

  // equals 2x the max concurrency
  if(addToCQ.length > maxConcurrency) {
    logger.info("Concurrency limited 2x (multiple) - ", "Concurrency queue jobs: ", addToCQ.length, "Max concurrency: ", maxConcurrency);
    // sendNotificationWithCustomDays(jobs[0].data.team_id, NotificationType.CONCURRENCY_LIMIT_REACHED, 10, false).catch((error) => {
    //   logger.error("Error sending notification (concurrency limit reached): ", error);
    // });
  }

  await Promise.all(
    addToBull.map(async (job) => {
      const size = JSON.stringify(job.data).length;
      return await Sentry.startSpan(
        {
          name: "Add scrape job",
          op: "queue.publish",
          attributes: {
            "messaging.message.id": job.opts.jobId,
            "messaging.destination.name": getScrapeQueue().name,
            "messaging.message.body.size": size,
          },
        },
        async (span) => {
          await _addScrapeJobToBullMQ(
            {
              ...job.data,
              sentry: {
                trace: Sentry.spanToTraceHeader(span),
                baggage: Sentry.spanToBaggageHeader(span),
                size,
              },
            },
            job.opts,
            job.opts.jobId,
            job.opts.priority,
          );
        },
      );
    }),
  );

  await Promise.all(
    addToCQ.map(async (job) => {
      const size = JSON.stringify(job.data).length;
      return await Sentry.startSpan(
        {
          name: "Add scrape job",
          op: "queue.publish",
          attributes: {
            "messaging.message.id": job.opts.jobId,
            "messaging.destination.name": getScrapeQueue().name,
            "messaging.message.body.size": size,
          },
        },
        async (span) => {
          await _addScrapeJobToConcurrencyQueue(
            {
              ...job.data,
              sentry: {
                trace: Sentry.spanToTraceHeader(span),
                baggage: Sentry.spanToBaggageHeader(span),
                size,
              },
            },
            job.opts,
            job.opts.jobId,
            job.opts.priority,
          );
        },
      );
    }),
  );
}

export function waitForJob<T = unknown>(
  jobId: string,
  timeout: number,
): Promise<T> {
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
          resolve((await getScrapeQueue().getJob(jobId))!.returnvalue);
        } else if (state === "failed") {
          // console.log("failed", (await getScrapeQueue().getJob(jobId)).failedReason);
          const job = await getScrapeQueue().getJob(jobId);
          if (job && job.failedReason !== "Concurrency limit hit") {
            clearInterval(int);
            reject(job.failedReason);
          }
        }
      }
    }, 250);
  });
}
