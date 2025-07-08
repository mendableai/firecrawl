import { getScrapeQueue } from "./queue-service";
import { v4 as uuidv4 } from "uuid";
import { NotificationType, RateLimiterMode, WebScraperOptions } from "../types";
import * as Sentry from "@sentry/node";
import {
  cleanOldConcurrencyLimitEntries,
  getConcurrencyLimitActiveJobs,
  getConcurrencyQueueJobsCount,
  getCrawlConcurrencyLimitActiveJobs,
  pushConcurrencyLimitActiveJob,
  pushConcurrencyLimitedJob,
  pushCrawlConcurrencyLimitActiveJob,
} from "../lib/concurrency-limit";
import { logger } from "../lib/logger";
import { sendNotificationWithCustomDays } from './notification/email_notification';
import { shouldSendConcurrencyLimitNotification } from './notification/notification-check';
import { getACUC, getACUCTeam } from "../controllers/auth";
import { getJobFromGCS, removeJobFromGCS } from "../lib/gcs-jobs";
import { Document } from "../controllers/v1/types";
import { getCrawl } from "../lib/crawl-redis";

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

export async function _addScrapeJobToBullMQ(
  webScraperOptions: WebScraperOptions,
  options: any,
  jobId: string,
  jobPriority: number,
) {
  if (
    webScraperOptions &&
    webScraperOptions.team_id
  ) {
    await pushConcurrencyLimitActiveJob(webScraperOptions.team_id, jobId, 60 * 1000); // 60s default timeout

    if (webScraperOptions.crawl_id) {
      const sc = await getCrawl(webScraperOptions.crawl_id);
      if (webScraperOptions.crawlerOptions?.delay || sc?.maxConcurrency) {
        await pushCrawlConcurrencyLimitActiveJob(webScraperOptions.crawl_id, jobId, 60 * 1000);
      }
    }
  }

  await getScrapeQueue().add(jobId, webScraperOptions, {
    ...options,
    priority: jobPriority,
    jobId,
  });
}

async function addScrapeJobRaw(
  webScraperOptions: WebScraperOptions,
  options: any,
  jobId: string,
  jobPriority: number,
  directToBullMQ: boolean = false,
) {
  let concurrencyLimited: "yes" | "yes-crawl" | "no" | null = null;
  let currentActiveConcurrency = 0;
  let maxConcurrency = 0;

  if (directToBullMQ) {
    concurrencyLimited = "no";
  } else {
    if (webScraperOptions.crawl_id) {
      const crawl = await getCrawl(webScraperOptions.crawl_id);
      const concurrencyLimit = !crawl
        ? null
        : crawl.crawlerOptions?.delay === undefined && crawl.maxConcurrency === undefined
          ? null
          : crawl.maxConcurrency ?? 1;
      
      if (concurrencyLimit !== null) {
        const crawlConcurrency = (await getCrawlConcurrencyLimitActiveJobs(webScraperOptions.crawl_id)).length;
        const freeSlots = Math.max(concurrencyLimit - crawlConcurrency, 0);
        if (freeSlots === 0) {
          concurrencyLimited = "yes-crawl";
        }
      }
    }

    if (concurrencyLimited === null) {
      const now = Date.now();
      const maxConcurrency = (await getACUCTeam(webScraperOptions.team_id, false, true, webScraperOptions.is_extract ? RateLimiterMode.Extract : RateLimiterMode.Crawl))?.concurrency ?? 2;
      await cleanOldConcurrencyLimitEntries(webScraperOptions.team_id, now);
      const currentActiveConcurrency = (await getConcurrencyLimitActiveJobs(webScraperOptions.team_id, now)).length;
      concurrencyLimited = currentActiveConcurrency >= maxConcurrency ? "yes" : "no";
    }
  }

  if (concurrencyLimited === "yes" || concurrencyLimited === "yes-crawl") {
    if (concurrencyLimited === "yes") {
      // Detect if they hit their concurrent limit
      // If above by 2x, send them an email
      // No need to 2x as if there are more than the max concurrency in the concurrency queue, it is already 2x
      const concurrencyQueueJobs = await getConcurrencyQueueJobsCount(webScraperOptions.team_id);
      if(concurrencyQueueJobs > maxConcurrency) {
        // logger.info("Concurrency limited 2x (single) - ", "Concurrency queue jobs: ", concurrencyQueueJobs, "Max concurrency: ", maxConcurrency, "Team ID: ", webScraperOptions.team_id);

        // Only send notification if it's not a crawl or batch scrape
          const shouldSendNotification = await shouldSendConcurrencyLimitNotification(webScraperOptions.team_id);
          if (shouldSendNotification) {
            sendNotificationWithCustomDays(webScraperOptions.team_id, NotificationType.CONCURRENCY_LIMIT_REACHED, 15, false, true).catch((error) => {
              logger.error("Error sending notification (concurrency limit reached)", { error });
            });
          }
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
  directToBullMQ: boolean = false,
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
          directToBullMQ,
        );
      },
    );
  } else {
    await addScrapeJobRaw(webScraperOptions, options, jobId, jobPriority, directToBullMQ);
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

  const jobsByTeam = new Map<string, {
    data: WebScraperOptions;
    opts: {
      jobId: string;
      priority: number;
    };
  }[]>();

  for (const job of jobs) {
    if (!jobsByTeam.has(job.data.team_id)) {
      jobsByTeam.set(job.data.team_id, []);
    }
    jobsByTeam.get(job.data.team_id)!.push(job);
  }

  for (const [teamId, teamJobs] of jobsByTeam) {
    // == Buckets for jobs ==
    let jobsForcedToCQ: {
      data: WebScraperOptions;
      opts: {
        jobId: string;
        priority: number;
      };
    }[] = [];

    let jobsPotentiallyInCQ: {
      data: WebScraperOptions;
      opts: {
        jobId: string;
        priority: number;
      };
    }[] = [];

    // == Select jobs by crawl ID ==
    const jobsByCrawlID = new Map<string, {
      data: WebScraperOptions;
      opts: {
        jobId: string;
        priority: number;
      };
    }[]>();

    const jobsWithoutCrawlID: {
      data: WebScraperOptions;
      opts: {
        jobId: string;
        priority: number;
      };
    }[] = [];

    for (const job of teamJobs) {
      if (job.data.crawl_id) {
        if (!jobsByCrawlID.has(job.data.crawl_id)) {
          jobsByCrawlID.set(job.data.crawl_id, []);
        }
        jobsByCrawlID.get(job.data.crawl_id)!.push(job);
      } else {
        jobsWithoutCrawlID.push(job);
      }
    }

    // == Select jobs by crawl ID ==
    for (const [crawlID, crawlJobs] of jobsByCrawlID) {
      const crawl = await getCrawl(crawlID);
      const concurrencyLimit = !crawl
        ? null
        : crawl.crawlerOptions?.delay === undefined && crawl.maxConcurrency === undefined
          ? null
          : crawl.maxConcurrency ?? 1;
        

      if (concurrencyLimit === null) {
        // All jobs may be in the CQ depending on the global team concurrency limit
        jobsPotentiallyInCQ.push(...crawlJobs);
      } else {
        const crawlConcurrency = (await getCrawlConcurrencyLimitActiveJobs(crawlID)).length;
        const freeSlots = Math.max(concurrencyLimit - crawlConcurrency, 0);

        // The first n jobs may be in the CQ depending on the global team concurrency limit
        jobsPotentiallyInCQ.push(...crawlJobs.slice(0, freeSlots));

        // Every job after that must be in the CQ, as the crawl concurrency limit has been reached
        jobsForcedToCQ.push(...crawlJobs.slice(freeSlots));
      }
    }

    // All jobs without a crawl ID may be in the CQ depending on the global team concurrency limit
    jobsPotentiallyInCQ.push(...jobsWithoutCrawlID);

    const now = Date.now();
    const maxConcurrency = (await getACUCTeam(teamId, false, true, jobs[0].data.from_extract ? RateLimiterMode.Extract : RateLimiterMode.Crawl))?.concurrency ?? 2;
    await cleanOldConcurrencyLimitEntries(teamId, now);

    const currentActiveConcurrency = (await getConcurrencyLimitActiveJobs(teamId, now)).length;

    const countCanBeDirectlyAdded = Math.max(
      maxConcurrency - currentActiveConcurrency,
      0,
    );

    const addToBull = jobsPotentiallyInCQ.slice(0, countCanBeDirectlyAdded);
    const addToCQ = jobsPotentiallyInCQ.slice(countCanBeDirectlyAdded).concat(jobsForcedToCQ);

    // equals 2x the max concurrency
    if((jobsPotentiallyInCQ.length - countCanBeDirectlyAdded) > maxConcurrency) {
      // logger.info(`Concurrency limited 2x (multiple) - Concurrency queue jobs: ${addToCQ.length} Max concurrency: ${maxConcurrency} Team ID: ${jobs[0].data.team_id}`);
      // Only send notification if it's not a crawl or batch scrape
      if (!isCrawlOrBatchScrape(jobs[0].data)) {
        const shouldSendNotification = await shouldSendConcurrencyLimitNotification(jobs[0].data.team_id);
        if (shouldSendNotification) {
          sendNotificationWithCustomDays(jobs[0].data.team_id, NotificationType.CONCURRENCY_LIMIT_REACHED, 15, false, true).catch((error) => {
            logger.error("Error sending notification (concurrency limit reached)", { error });
          });
        }
      }
    }

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
          const job = (await getScrapeQueue().getJob(jobId))!;
          doc = job.returnvalue;

          if (!doc) {
            const docs = await getJobFromGCS(jobId);
            if (!docs || docs.length === 0) {
              throw new Error("Job not found in GCS");
            }
            doc = docs[0];

            if (job.data?.internalOptions?.zeroDataRetention) {
              await removeJobFromGCS(jobId);
            }
          }

          resolve(doc);
        } else if (state === "failed") {
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
