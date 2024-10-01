import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../../src/types";
import { isUrlBlocked } from "../../../src/scraper/WebScraper/utils/blocklist";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../../src/lib/logger";
import { addCrawlJob, crawlToCrawler, lockURL, saveCrawl, StoredCrawl } from "../../../src/lib/crawl-redis";
import { addScrapeJob } from "../../../src/services/queue-jobs";
import { checkAndUpdateURL } from "../../../src/lib/validateUrl";
import * as Sentry from "@sentry/node";

export async function crawlPreviewController(req: Request, res: Response) {
  try {
    const { success, error, status, team_id:a, plan } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Preview
    );

    const team_id = "preview";

    if (!success) {
      return res.status(status).json({ error });
    }

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
      return res
        .status(403)
        .json({
          error:
            "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.",
        });
    }

    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false, includeHtml: false, removeTags: [] };

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

    let robots;

    try {
      robots = await this.getRobotsTxt();
    } catch (_) {}

    const sc: StoredCrawl = {
      originUrl: url,
      crawlerOptions,
      pageOptions,
      team_id,
      plan,
      robots,
      createdAt: Date.now(),
    };

    await saveCrawl(id, sc);

    const crawler = crawlToCrawler(id, sc);

    const sitemap = sc.crawlerOptions?.ignoreSitemap ? null : await crawler.tryGetSitemap();

    if (sitemap !== null) {
      for (const url of sitemap.map(x => x.url)) {
        await lockURL(id, sc, url);
        const job = await addScrapeJob({
          url,
          mode: "single_urls",
          crawlerOptions: crawlerOptions,
          team_id,
          plan,
          pageOptions: pageOptions,
          origin: "website-preview",
          crawl_id: id,
          sitemapped: true,
        });
        await addCrawlJob(id, job.id);
      }
    } else {
      await lockURL(id, sc, url);
      const job = await addScrapeJob({
        url,
        mode: "single_urls",
        crawlerOptions: crawlerOptions,
        team_id,
        plan,
        pageOptions: pageOptions,
        origin: "website-preview",
        crawl_id: id,
      });
      await addCrawlJob(id, job.id);
    }

    res.json({ jobId: id });
  } catch (error) {
    Sentry.captureException(error);
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
