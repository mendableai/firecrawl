import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  BatchScrapeRequest,
  batchScrapeRequestSchema,
  batchScrapeRequestSchemaNoURLValidation,
  url as urlSchema,
  RequestWithAuth,
  ScrapeOptions,
  BatchScrapeResponse,
} from "./types";
import {
  addCrawlJobs,
  finishCrawlKickoff,
  getCrawl,
  lockURLs,
  saveCrawl,
  StoredCrawl,
} from "../../lib/crawl-redis";
import { logCrawl } from "../../services/logging/crawl_log";
import { getJobPriority } from "../../lib/job-priority";
import { addScrapeJobs } from "../../services/queue-jobs";
import { callWebhook } from "../../services/webhook";
import { logger as _logger } from "../../lib/logger";

export async function batchScrapeController(
  req: RequestWithAuth<{}, BatchScrapeResponse, BatchScrapeRequest>,
  res: Response<BatchScrapeResponse>,
) {
  if (req.body?.ignoreInvalidURLs === true) {
    req.body = batchScrapeRequestSchemaNoURLValidation.parse(req.body);
  } else {
    req.body = batchScrapeRequestSchema.parse(req.body);
  }

  const id = req.body.appendToId ?? uuidv4();
  const logger = _logger.child({
    crawlId: id,
    batchScrapeId: id,
    module: "api/v1",
    method: "batchScrapeController",
    teamId: req.auth.team_id,
    plan: req.auth.plan,
  });

  let urls = req.body.urls;
  let invalidURLs: string[] | undefined = undefined;

  if (req.body.ignoreInvalidURLs) {
    invalidURLs = [];

    let pendingURLs = urls;
    urls = [];
    for (const u of pendingURLs) {
      try {
        const nu = urlSchema.parse(u);
        urls.push(nu);
      } catch (_) {
        invalidURLs.push(u);
      }
    }
  }

  logger.debug("Batch scrape " + id + " starting", {
    urlsLength: urls.length,
    appendToId: req.body.appendToId,
    account: req.account,
  });

  if (!req.body.appendToId) {
    await logCrawl(id, req.auth.team_id);
  }

  let { remainingCredits } = req.account!;
  const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
  if (!useDbAuthentication) {
    remainingCredits = Infinity;
  }

  const sc: StoredCrawl = req.body.appendToId
    ? ((await getCrawl(req.body.appendToId)) as StoredCrawl)
    : {
        crawlerOptions: null,
        scrapeOptions: req.body,
        internalOptions: { disableSmartWaitCache: true }, // NOTE: smart wait disabled for batch scrapes to ensure contentful scrape, speed does not matter
        team_id: req.auth.team_id,
        createdAt: Date.now(),
        plan: req.auth.plan,
      };

  if (!req.body.appendToId) {
    await saveCrawl(id, sc);
  }

  let jobPriority = 20;

  // If it is over 1000, we need to get the job priority,
  // otherwise we can use the default priority of 20
  if (urls.length > 1000) {
    // set base to 21
    jobPriority = await getJobPriority({
      plan: req.auth.plan,
      team_id: req.auth.team_id,
      basePriority: 21,
    });
  }
  logger.debug("Using job priority " + jobPriority, { jobPriority });

  const scrapeOptions: ScrapeOptions = { ...req.body };
  delete (scrapeOptions as any).urls;
  delete (scrapeOptions as any).appendToId;

  const jobs = urls.map((x) => {
    return {
      data: {
        url: x,
        mode: "single_urls" as const,
        team_id: req.auth.team_id,
        plan: req.auth.plan!,
        crawlerOptions: null,
        scrapeOptions,
        origin: "api",
        crawl_id: id,
        sitemapped: true,
        v1: true,
        webhook: req.body.webhook,
      },
      opts: {
        jobId: uuidv4(),
        priority: 20,
      },
    };
  });

  await finishCrawlKickoff(id);

  logger.debug("Locking URLs...");
  await lockURLs(
    id,
    sc,
    jobs.map((x) => x.data.url),
  );
  logger.debug("Adding scrape jobs to Redis...");
  await addCrawlJobs(
    id,
    jobs.map((x) => x.opts.jobId),
  );
  logger.debug("Adding scrape jobs to BullMQ...");
  await addScrapeJobs(jobs);

  if (req.body.webhook) {
    logger.debug("Calling webhook with batch_scrape.started...", {
      webhook: req.body.webhook,
    });
    await callWebhook(
      req.auth.team_id,
      id,
      null,
      req.body.webhook,
      true,
      "batch_scrape.started",
    );
  }

  const protocol = process.env.ENV === "local" ? req.protocol : "https";

  return res.status(200).json({
    success: true,
    id,
    url: `${protocol}://${req.get("host")}/v1/batch/scrape/${id}`,
    invalidURLs,
  });
}
