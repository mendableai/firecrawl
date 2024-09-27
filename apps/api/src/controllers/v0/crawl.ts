import { Request, Response } from "express";
import { checkTeamCredits } from "../../../src/services/billing/credit_billing";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../../src/types";
import { addScrapeJob } from "../../../src/services/queue-jobs";
import { isUrlBlocked } from "../../../src/scraper/WebScraper/utils/blocklist";
import { logCrawl } from "../../../src/services/logging/crawl_log";
import { validateIdempotencyKey } from "../../../src/services/idempotency/validate";
import { createIdempotencyKey } from "../../../src/services/idempotency/create";
import { defaultCrawlPageOptions, defaultCrawlerOptions, defaultOrigin } from "../../../src/lib/default-values";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../../src/lib/logger";
import { addCrawlJob, addCrawlJobs, crawlToCrawler, lockURL, lockURLs, saveCrawl, StoredCrawl } from "../../../src/lib/crawl-redis";
import { getScrapeQueue } from "../../../src/services/queue-service";
import { checkAndUpdateURL } from "../../../src/lib/validateUrl";
import * as Sentry from "@sentry/node";
import { getJobPriority } from "../../lib/job-priority";

export async function crawlController(req: Request, res: Response) {
  try {
    const { success, team_id, error, status, plan, chunk } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Crawl
    );
    if (!success) {
      return res.status(status).json({ error });
    }

    if (req.headers["x-idempotency-key"]) {
      const isIdempotencyValid = await validateIdempotencyKey(req);
      if (!isIdempotencyValid) {
        return res.status(409).json({ error: "Idempotency key already used" });
      }
      try {
        createIdempotencyKey(req);
      } catch (error) {
        Logger.error(error);
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
    const { success: creditsCheckSuccess, message: creditsCheckMessage, remainingCredits } =
      await checkTeamCredits(chunk, team_id, limitCheck);

    if (!creditsCheckSuccess) {
      return res.status(402).json({ error: "Insufficient credits. You may be requesting with a higher limit than the amount of credits you have left. If not, upgrade your plan at https://firecrawl.dev/pricing or contact us at hello@firecrawl.com" });
    }

    // TODO: need to do this to v1
    crawlerOptions.limit = Math.min(remainingCredits, crawlerOptions.limit);
    
    let url = req.body.url;
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
        error:
          "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.",
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
    //     Logger.error(error);
    //     return res.status(500).json({ error: error.message });
    //   }
    // }

    const id = uuidv4();

    await logCrawl(id, team_id);

    const sc: StoredCrawl = {
      originUrl: url,
      crawlerOptions,
      pageOptions,
      team_id,
      plan,
      createdAt: Date.now(),
    };

    const crawler = crawlToCrawler(id, sc);

    try {
      sc.robots = await crawler.getRobotsTxt();
    } catch (_) {}

    await saveCrawl(id, sc);

    const sitemap = sc.crawlerOptions?.ignoreSitemap
      ? null
      : await crawler.tryGetSitemap();


    if (sitemap !== null && sitemap.length > 0) {
      let jobPriority = 20;
      // If it is over 1000, we need to get the job priority,
      // otherwise we can use the default priority of 20
      if(sitemap.length > 1000){
        // set base to 21
        jobPriority = await getJobPriority({plan, team_id, basePriority: 21})
      }
      const jobs = sitemap.map((x) => {
        const url = x.url;
        const uuid = uuidv4();
        return {
          name: uuid,
          data: {
            url,
            mode: "single_urls",
            crawlerOptions: crawlerOptions,
            team_id,
            plan,
            pageOptions: pageOptions,
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
        jobs.map((x) => x.data.url)
      );
      await addCrawlJobs(
        id,
        jobs.map((x) => x.opts.jobId)
      );
      if (Sentry.isInitialized()) {
        for (const job of jobs) {
          // add with sentry instrumentation
          await addScrapeJob(job.data as any, {}, job.opts.jobId);
        }
      } else {
        await getScrapeQueue().addBulk(jobs);
      }
    } else {
      await lockURL(id, sc, url);

      // Not needed, first one should be 15.
      // const jobPriority = await getJobPriority({plan, team_id, basePriority: 10})

      const job = await addScrapeJob(
        {
          url,
          mode: "single_urls",
          crawlerOptions: crawlerOptions,
          team_id,
          plan,
          pageOptions: pageOptions,
          origin: req.body.origin ?? defaultOrigin,
          crawl_id: id,
        },
        {
          priority: 15, // prioritize request 0 of crawl jobs same as scrape jobs
        }
      );
      await addCrawlJob(id, job.id);
    }

    res.json({ jobId: id });
  } catch (error) {
    Sentry.captureException(error);
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
