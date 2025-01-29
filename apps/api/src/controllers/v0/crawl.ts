import { Request, Response } from "express";
import { checkTeamCredits } from "../../../src/services/billing/credit_billing";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../../src/types";
import { addScrapeJob } from "../../../src/services/queue-jobs";
import { isUrlBlocked } from "../../../src/scraper/WebScraper/utils/blocklist";
import { logCrawl } from "../../../src/services/logging/crawl_log";
import { validateIdempotencyKey } from "../../../src/services/idempotency/validate";
import { createIdempotencyKey } from "../../../src/services/idempotency/create";
import {
  defaultCrawlPageOptions,
  defaultCrawlerOptions,
  defaultOrigin,
} from "../../../src/lib/default-values";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../../src/lib/logger";
import {
  addCrawlJob,
  addCrawlJobs,
  crawlToCrawler,
  finishCrawlKickoff,
  lockURL,
  lockURLs,
  saveCrawl,
  StoredCrawl,
} from "../../../src/lib/crawl-redis";
import { getScrapeQueue, redisConnection } from "../../../src/services/queue-service";
import { checkAndUpdateURL } from "../../../src/lib/validateUrl";
import * as Sentry from "@sentry/node";
import { getJobPriority } from "../../lib/job-priority";
import { fromLegacyScrapeOptions, url as urlSchema } from "../v1/types";
import { ZodError } from "zod";
import { BLOCKLISTED_URL_MESSAGE } from "../../lib/strings";

export async function crawlController(req: Request, res: Response) {
  try {
    const auth = await authenticateUser(req, res, RateLimiterMode.Crawl);
    if (!auth.success) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { team_id, plan, chunk } = auth;

    redisConnection.sadd("teams_using_v0", team_id)
      .catch(error => logger.error("Failed to add team to teams_using_v0", { error, team_id }));

    if (req.headers["x-idempotency-key"]) {
      const isIdempotencyValid = await validateIdempotencyKey(req);
      if (!isIdempotencyValid) {
        return res.status(409).json({ error: "Idempotency key already used" });
      }
      try {
        createIdempotencyKey(req);
      } catch (error) {
        logger.error(error);
        return res.status(500).json({ error: error.message });
      }
    }

    const crawlerOptions = {
      ...defaultCrawlerOptions,
      ...req.body.crawlerOptions,
    };
    const pageOptions = { ...defaultCrawlPageOptions, ...req.body.pageOptions };

    if (Array.isArray(crawlerOptions.includes)) {
      for (const x of crawlerOptions.includes) {
        try {
          new RegExp(x);
        } catch (e) {
          return res.status(400).json({ error: e.message });
        }
      }
    }

    if (Array.isArray(crawlerOptions.excludes)) {
      for (const x of crawlerOptions.excludes) {
        try {
          new RegExp(x);
        } catch (e) {
          return res.status(400).json({ error: e.message });
        }
      }
    }

    const limitCheck = req.body?.crawlerOptions?.limit ?? 1;
    const {
      success: creditsCheckSuccess,
      message: creditsCheckMessage,
      remainingCredits,
    } = await checkTeamCredits(chunk, team_id, limitCheck);

    if (!creditsCheckSuccess) {
      return res.status(402).json({
        error:
          "Insufficient credits. You may be requesting with a higher limit than the amount of credits you have left. If not, upgrade your plan at https://firecrawl.dev/pricing or contact us at help@firecrawl.com",
      });
    }

    // TODO: need to do this to v1
    crawlerOptions.limit = Math.min(remainingCredits, crawlerOptions.limit);

    let url = urlSchema.parse(req.body.url);
    if (!url) {
      return res.status(400).json({ error: "Url is required" });
    }
    if (typeof url !== "string") {
      return res.status(400).json({ error: "URL must be a string" });
    }
    try {
      url = checkAndUpdateURL(url).url;
    } catch (e) {
      return res
        .status(e instanceof Error && e.message === "Invalid URL" ? 400 : 500)
        .json({ error: e.message ?? e });
    }

    if (isUrlBlocked(url)) {
      return res.status(403).json({
        error: BLOCKLISTED_URL_MESSAGE,
      });
    }

    // if (mode === "single_urls" && !url.includes(",")) { // NOTE: do we need this?
    //   try {
    //     const a = new WebScraperDataProvider();
    //     await a.setOptions({
    //       jobId: uuidv4(),
    //       mode: "single_urls",
    //       urls: [url],
    //       crawlerOptions: { ...crawlerOptions, returnOnlyUrls: true },
    //       pageOptions: pageOptions,
    //     });

    //     const docs = await a.getDocuments(false, (progress) => {
    //       job.updateProgress({
    //         current: progress.current,
    //         total: progress.total,
    //         current_step: "SCRAPING",
    //         current_url: progress.currentDocumentUrl,
    //       });
    //     });
    //     return res.json({
    //       success: true,
    //       documents: docs,
    //     });
    //   } catch (error) {
    //     logger.error(error);
    //     return res.status(500).json({ error: error.message });
    //   }
    // }

    const id = uuidv4();

    await logCrawl(id, team_id);

    const { scrapeOptions, internalOptions } = fromLegacyScrapeOptions(
      pageOptions,
      undefined,
      undefined,
    );
    internalOptions.disableSmartWaitCache = true; // NOTE: smart wait disabled for crawls to ensure contentful scrape, speed does not matter

    delete (scrapeOptions as any).timeout;

    const sc: StoredCrawl = {
      originUrl: url,
      crawlerOptions,
      scrapeOptions,
      internalOptions,
      team_id,
      plan,
      createdAt: Date.now(),
    };

    const crawler = crawlToCrawler(id, sc);

    try {
      sc.robots = await crawler.getRobotsTxt();
    } catch (_) {}

    await saveCrawl(id, sc);

    await finishCrawlKickoff(id);

    const sitemap = sc.crawlerOptions.ignoreSitemap
      ? 0
      : await crawler.tryGetSitemap(async (urls) => {
          if (urls.length === 0) return;

          let jobPriority = await getJobPriority({
            plan,
            team_id,
            basePriority: 21,
          });
          const jobs = urls.map((url) => {
            const uuid = uuidv4();
            return {
              name: uuid,
              data: {
                url,
                mode: "single_urls",
                crawlerOptions,
                scrapeOptions,
                internalOptions,
                team_id,
                plan,
                origin: req.body.origin ?? defaultOrigin,
                crawl_id: id,
                sitemapped: true,
              },
              opts: {
                jobId: uuid,
                priority: jobPriority,
              },
            };
          });

          await lockURLs(
            id,
            sc,
            jobs.map((x) => x.data.url),
          );
          await addCrawlJobs(
            id,
            jobs.map((x) => x.opts.jobId),
          );
          for (const job of jobs) {
            // add with sentry instrumentation
            await addScrapeJob(job.data as any, {}, job.opts.jobId);
          }
        });

    if (sitemap === 0) {
      await lockURL(id, sc, url);

      // Not needed, first one should be 15.
      // const jobPriority = await getJobPriority({plan, team_id, basePriority: 10})

      const jobId = uuidv4();
      await addScrapeJob(
        {
          url,
          mode: "single_urls",
          crawlerOptions,
          scrapeOptions,
          internalOptions,
          team_id,
          plan: plan!,
          origin: req.body.origin ?? defaultOrigin,
          crawl_id: id,
        },
        {
          priority: 15, // prioritize request 0 of crawl jobs same as scrape jobs
        },
        jobId,
      );
      await addCrawlJob(id, jobId);
    }

    res.json({ jobId: id });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(error);
    return res.status(500).json({
      error: error instanceof ZodError ? "Invalid URL" : error.message,
    });
  }
}
