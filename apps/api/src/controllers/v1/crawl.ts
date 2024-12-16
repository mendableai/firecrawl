import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  CrawlRequest,
  crawlRequestSchema,
  CrawlResponse,
  RequestWithAuth,
  toLegacyCrawlerOptions,
} from "./types";
import {
  addCrawlJob,
  addCrawlJobs,
  crawlToCrawler,
  lockURL,
  lockURLs,
  saveCrawl,
  StoredCrawl,
} from "../../lib/crawl-redis";
import { logCrawl } from "../../services/logging/crawl_log";
import { getScrapeQueue } from "../../services/queue-service";
import { addScrapeJob, addScrapeJobs } from "../../services/queue-jobs";
import { logger as _logger } from "../../lib/logger";
import { getJobPriority } from "../../lib/job-priority";
import { callWebhook } from "../../services/webhook";
import { scrapeOptions as scrapeOptionsSchema } from "./types";

export async function crawlController(
  req: RequestWithAuth<{}, CrawlResponse, CrawlRequest>,
  res: Response<CrawlResponse>,
) {
  const preNormalizedBody = req.body;
  req.body = crawlRequestSchema.parse(req.body);

  const id = uuidv4();
  const logger = _logger.child({
    crawlId: id,
    module: "api/v1",
    method: "crawlController",
    teamId: req.auth.team_id,
    plan: req.auth.plan,
  });
  logger.debug("Crawl " + id + " starting", {
    request: req.body,
    originalRequest: preNormalizedBody,
    account: req.account,
  });

  await logCrawl(id, req.auth.team_id);

  let { remainingCredits } = req.account!;
  const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
  if (!useDbAuthentication) {
    remainingCredits = Infinity;
  }

  const crawlerOptions = {
    ...req.body,
    url: undefined,
    scrapeOptions: undefined,
  };
  const scrapeOptions = req.body.scrapeOptions;

  // TODO: @rafa, is this right? copied from v0
  if (Array.isArray(crawlerOptions.includePaths)) {
    for (const x of crawlerOptions.includePaths) {
      try {
        new RegExp(x);
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }
  }

  if (Array.isArray(crawlerOptions.excludePaths)) {
    for (const x of crawlerOptions.excludePaths) {
      try {
        new RegExp(x);
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }
  }

  const originalLimit = crawlerOptions.limit;
  crawlerOptions.limit = Math.min(remainingCredits, crawlerOptions.limit);
  logger.debug("Determined limit: " + crawlerOptions.limit, {
    remainingCredits,
    bodyLimit: originalLimit,
    originalBodyLimit: preNormalizedBody.limit,
  });

  const sc: StoredCrawl = {
    originUrl: req.body.url,
    crawlerOptions: toLegacyCrawlerOptions(crawlerOptions),
    scrapeOptions,
    internalOptions: { disableSmartWaitCache: true }, // NOTE: smart wait disabled for crawls to ensure contentful scrape, speed does not matter
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan,
  };

  const crawler = crawlToCrawler(id, sc);

  try {
    sc.robots = await crawler.getRobotsTxt(scrapeOptions.skipTlsVerification);
  } catch (e) {
    logger.debug("Failed to get robots.txt (this is probably fine!)", {
      error: e,
    });
  }

  await saveCrawl(id, sc);

  const sitemap = sc.crawlerOptions.ignoreSitemap
    ? null
    : await crawler.tryGetSitemap();

  if (sitemap !== null && sitemap.length > 0) {
    logger.debug("Using sitemap of length " + sitemap.length, {
      sitemapLength: sitemap.length,
    });
    let jobPriority = 20;
    // If it is over 1000, we need to get the job priority,
    // otherwise we can use the default priority of 20
    if (sitemap.length > 1000) {
      // set base to 21
      jobPriority = await getJobPriority({
        plan: req.auth.plan,
        team_id: req.auth.team_id,
        basePriority: 21,
      });
    }
    logger.debug("Using job priority " + jobPriority, { jobPriority });

    const jobs = sitemap.map((x) => {
      const url = x.url;
      const uuid = uuidv4();
      return {
        name: uuid,
        data: {
          url,
          mode: "single_urls" as const,
          team_id: req.auth.team_id,
          plan: req.auth.plan!,
          crawlerOptions,
          scrapeOptions,
          internalOptions: sc.internalOptions,
          origin: "api",
          crawl_id: id,
          sitemapped: true,
          webhook: req.body.webhook,
          v1: true,
        },
        opts: {
          jobId: uuid,
          priority: 20,
        },
      };
    });

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
  } else {
    logger.debug("Sitemap not found or ignored.", {
      ignoreSitemap: sc.crawlerOptions.ignoreSitemap,
    });

    logger.debug("Locking URL...");
    await lockURL(id, sc, req.body.url);
    const jobId = uuidv4();
    logger.debug("Adding scrape job to Redis...", { jobId });
    await addScrapeJob(
      {
        url: req.body.url,
        mode: "single_urls",
        team_id: req.auth.team_id,
        crawlerOptions,
        scrapeOptions: scrapeOptionsSchema.parse(scrapeOptions),
        internalOptions: sc.internalOptions,
        plan: req.auth.plan!,
        origin: "api",
        crawl_id: id,
        webhook: req.body.webhook,
        v1: true,
      },
      {
        priority: 15,
      },
      jobId,
    );
    logger.debug("Adding scrape job to BullMQ...", { jobId });
    await addCrawlJob(id, jobId);
  }
  logger.debug("Done queueing jobs!");

  if (req.body.webhook) {
    logger.debug("Calling webhook with crawl.started...", {
      webhook: req.body.webhook,
    });
    await callWebhook(
      req.auth.team_id,
      id,
      null,
      req.body.webhook,
      true,
      "crawl.started",
    );
  }

  const protocol = process.env.ENV === "local" ? req.protocol : "https";

  return res.status(200).json({
    success: true,
    id,
    url: `${protocol}://${req.get("host")}/v1/crawl/${id}`,
  });
}
