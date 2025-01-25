import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../../src/types";
import { isUrlBlocked } from "../../../src/scraper/WebScraper/utils/blocklist";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../../src/lib/logger";
import {
  addCrawlJob,
  crawlToCrawler,
  finishCrawlKickoff,
  lockURL,
  saveCrawl,
  StoredCrawl,
} from "../../../src/lib/crawl-redis";
import { addScrapeJob } from "../../../src/services/queue-jobs";
import { checkAndUpdateURL } from "../../../src/lib/validateUrl";
import * as Sentry from "@sentry/node";
import { fromLegacyScrapeOptions } from "../v1/types";
import { BLOCKLISTED_URL_MESSAGE } from "../../lib/strings";

export async function crawlPreviewController(req: Request, res: Response) {
  try {
    const auth = await authenticateUser(req, res, RateLimiterMode.Preview);

    const incomingIP = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress) as string;
    const iptoken = incomingIP + "this_is_just_a_preview_token";
    const team_id = `preview_${iptoken}`;

    if (!auth.success) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const { plan } = auth;

    let url = req.body.url;
    if (!url) {
      return res.status(400).json({ error: "Url is required" });
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

    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? {
      onlyMainContent: false,
      includeHtml: false,
      removeTags: [],
    };

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

    let robots;

    try {
      robots = await this.getRobotsTxt();
    } catch (_) {}

    const { scrapeOptions, internalOptions } = fromLegacyScrapeOptions(
      pageOptions,
      undefined,
      undefined,
    );

    const sc: StoredCrawl = {
      originUrl: url,
      crawlerOptions,
      scrapeOptions,
      internalOptions,
      team_id,
      plan,
      robots,
      createdAt: Date.now(),
    };

    await saveCrawl(id, sc);

    const crawler = crawlToCrawler(id, sc);

    await finishCrawlKickoff(id);

    const sitemap = sc.crawlerOptions?.ignoreSitemap
      ? 0
      : await crawler.tryGetSitemap(async (urls) => {
          for (const url of urls) {
            await lockURL(id, sc, url);
            const jobId = uuidv4();
            await addScrapeJob(
              {
                url,
                mode: "single_urls",
                team_id,
                plan: plan!,
                crawlerOptions,
                scrapeOptions,
                internalOptions,
                origin: "website-preview",
                crawl_id: id,
                sitemapped: true,
              },
              {},
              jobId,
            );
            await addCrawlJob(id, jobId);
          }
        });

    if (sitemap === 0) {
      await lockURL(id, sc, url);
      const jobId = uuidv4();
      await addScrapeJob(
        {
          url,
          mode: "single_urls",
          team_id,
          plan: plan!,
          crawlerOptions,
          scrapeOptions,
          internalOptions,
          origin: "website-preview",
          crawl_id: id,
        },
        {},
        jobId,
      );
      await addCrawlJob(id, jobId);
    }

    res.json({ jobId: id });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
