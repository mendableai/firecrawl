import { getScrapeQueue } from "./queue-service";
import { v4 as uuidv4 } from "uuid";
import { NotificationType, RateLimiterMode, WebScraperOptions } from "../types";
import * as Sentry from "@sentry/node";
import {
  cleanOldConcurrencyLimitEntries,
  cleanOldCrawlConcurrencyLimitEntries,
  getConcurrencyLimitActiveJobs,
  getConcurrencyQueueJobsCount,
  getCrawlConcurrencyQueueJobsCount,
  pushConcurrencyLimitActiveJob,
  pushConcurrencyLimitedJob,
  pushCrawlConcurrencyLimitActiveJob,
  pushCrawlConcurrencyLimitedJob,
} from "../lib/concurrency-limit";
import { logger } from "../lib/logger";
import { sendNotificationWithCustomDays } from './notification/email_notification';
import { shouldSendConcurrencyLimitNotification } from './notification/notification-check';
import { getACUC, getACUCTeam } from "../controllers/auth";
import { getJobFromGCS } from "../lib/gcs-jobs";
import { Document } from "../controllers/v1/types";

/**
 * Checks if a job is a crawl or batch scrape based on its options
 * @param options The job options containing crawlerOptions and crawl_id
 * @returns true if the job is either a crawl or batch scrape
 */
function isCrawlOrBatchScrape(options: { crawlerOptions?: any; crawl_id?: string }): boolean {
  // If crawlerOptions exists, it's a crawl
  // If crawl_id exists but no crawlerOptions, it's a batch scrape
  return !!options.crawlerOptions || !!options.crawl_id;
}

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
  }, webScraperOptions.crawl_id ? Infinity :(webScraperOptions.scrapeOptions?.timeout ?? (60 * 1000)));
}

async function _addCrawlScrapeJobToConcurrencyQueue(
  webScraperOptions: any,
  options: any,
  jobId: string,
  jobPriority: number,
) {
  await pushCrawlConcurrencyLimitedJob(webScraperOptions.crawl_id, {
    id: jobId,
    data: webScraperOptions,
    opts: {
      ...options,
      priority: jobPriority,
      jobId: jobId,
    },
    priority: jobPriority,
  });
  // NEVER ADD THESE TO BULLMQ!!! THEY ARE ADDED IN QUEUE-WORKER!!! SHOOOOO!!! - mogery
}

export async function _addScrapeJobToBullMQ(
  webScraperOptions: any,
  options: any,
  jobId: string,
  jobPriority: number,
) {
  if (
    webScraperOptions &&
    webScraperOptions.team_id
  ) {
    if (webScraperOptions.crawl_id && webScraperOptions.crawlerOptions?.delay) {
      await pushCrawlConcurrencyLimitActiveJob(webScraperOptions.crawl_id, jobId, 60 * 1000);
    } else {
      await pushConcurrencyLimitActiveJob(webScraperOptions.team_id, jobId, 60 * 1000); // 60s default timeout
    }
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
  const hasCrawlDelay = webScraperOptions.crawl_id && webScraperOptions.crawlerOptions?.delay;

  if (hasCrawlDelay) {
    await _addCrawlScrapeJobToConcurrencyQueue(
      webScraperOptions,
      options,
      jobId,
      jobPriority
    );
    return;
  }

  let concurrencyLimited = false;
  let currentActiveConcurrency = 0;
  let maxConcurrency = 0;

  if (
    webScraperOptions &&
    webScraperOptions.team_id
  ) {
    const now = Date.now();
    maxConcurrency = (await getACUCTeam(webScraperOptions.team_id, false, true, webScraperOptions.is_extract ? RateLimiterMode.Extract : RateLimiterMode.Crawl))?.concurrency ?? 2;
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
      // logger.info("Concurrency limited 2x (single) - ", "Concurrency queue jobs: ", concurrencyQueueJobs, "Max concurrency: ", maxConcurrency, "Team ID: ", webScraperOptions.team_id);

      // Only send notification if it's not a crawl or batch scrape
        const shouldSendNotification = await shouldSendConcurrencyLimitNotification(webScraperOptions.team_id);
        if (shouldSendNotification) {
          sendNotificationWithCustomDays(webScraperOptions.team_id, NotificationType.CONCURRENCY_LIMIT_REACHED, 15, false).catch((error) => {
            logger.error("Error sending notification (concurrency limit reached)", { error });
          });
        }
    }

    webScraperOptions.concurrencyLimited = true;

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

  const addToCCQ = jobs.filter(job => job.data.crawlerOptions?.delay);
  const dontAddToCCQ = jobs.filter(job => !job.data.crawlerOptions?.delay);

  let countCanBeDirectlyAdded = Infinity;
  let currentActiveConcurrency = 0;
  let maxConcurrency = 0;

  if (dontAddToCCQ[0] && dontAddToCCQ[0].data && dontAddToCCQ[0].data.team_id) {
    const now = Date.now();
    maxConcurrency = (await getACUCTeam(dontAddToCCQ[0].data.team_id, false, true, dontAddToCCQ[0].data.from_extract ? RateLimiterMode.Extract : RateLimiterMode.Crawl))?.concurrency ?? 2;
    cleanOldConcurrencyLimitEntries(dontAddToCCQ[0].data.team_id, now);

    currentActiveConcurrency = (await getConcurrencyLimitActiveJobs(dontAddToCCQ[0].data.team_id, now)).length;

    countCanBeDirectlyAdded = Math.max(
      maxConcurrency - currentActiveConcurrency,
      0,
    );
  }

  const addToBull = dontAddToCCQ.slice(0, countCanBeDirectlyAdded);
  const addToCQ = dontAddToCCQ.slice(countCanBeDirectlyAdded);

  // equals 2x the max concurrency
  if(addToCQ.length > maxConcurrency) {
    // logger.info(`Concurrency limited 2x (multiple) - Concurrency queue jobs: ${addToCQ.length} Max concurrency: ${maxConcurrency} Team ID: ${jobs[0].data.team_id}`);
    // Only send notification if it's not a crawl or batch scrape
    if (!isCrawlOrBatchScrape(dontAddToCCQ[0].data)) {
      const shouldSendNotification = await shouldSendConcurrencyLimitNotification(dontAddToCCQ[0].data.team_id);
      if (shouldSendNotification) {
        sendNotificationWithCustomDays(dontAddToCCQ[0].data.team_id, NotificationType.CONCURRENCY_LIMIT_REACHED, 15, false).catch((error) => {
          logger.error("Error sending notification (concurrency limit reached)", { error });
        });
      }
    }
  }

  await Promise.all(  
    addToCCQ.map(async (job) => {
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
          await _addCrawlScrapeJobToConcurrencyQueue(
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
          const jobData = {
            ...job.data,
            sentry: {
              trace: Sentry.spanToTraceHeader(span),
              baggage: Sentry.spanToBaggageHeader(span),
              size,
            },
          };

          await _addScrapeJobToConcurrencyQueue(
            jobData,
            job.opts,
            job.opts.jobId,
            job.opts.priority,
          );
        },
      );
    }),
  );

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
}

export function waitForJob(
  jobId: string,
  timeout: number,
): Promise<Document> {
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
          let doc: Document;
          doc = (await getScrapeQueue().getJob(jobId))!.returnvalue;

          if (!doc) {
            const docs = await getJobFromGCS(jobId);
            if (!docs || docs.length === 0) {
              throw new Error("Job not found in GCS");
            }
            doc = docs[0];
          }

          resolve(doc);
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
