import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../../src/types";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../../src/lib/logger";
import {
  addCrawlJob,
  crawlToCrawler,
  lockURL,
  saveCrawl,
  StoredCrawl,
} from "../../../src/lib/crawl-redis";
import { addScrapeJobRaw } from "../../../src/services/queue-jobs";
import { checkAndUpdateURL } from "../../../src/lib/validateUrl";

export async function crawlPreviewController(req: Request, res: Response) {
  try {
    const {
      success,
      error,
      status,
      team_id: a,
      plan,
    } = await authenticateUser(req, res, RateLimiterMode.Preview);

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

    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? {
      includeHtml: false,
      removeTags: [],
    };

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

    const sitemap =
      sc.crawlerOptions?.ignoreSitemap ?? true
        ? null
        : await crawler.tryGetSitemap();

    if (sitemap !== null) {
      for (const url of sitemap.map((x) => x.url)) {
        await lockURL(id, sc, url);
        const job = await addScrapeJobRaw(
          {
            url,
            mode: "single_urls",
            crawlerOptions: crawlerOptions,
            team_id: team_id,
            pageOptions: pageOptions,
            origin: "website-preview",
            crawl_id: id,
            sitemapped: true,
          },
          {},
          uuidv4(),
          10
        );
        await addCrawlJob(id, job.id);
      }
    } else {
      await lockURL(id, sc, url);
      const job = await addScrapeJobRaw(
        {
          url,
          mode: "single_urls",
          crawlerOptions: crawlerOptions,
          team_id: team_id,
          pageOptions: pageOptions,
          origin: "website-preview",
          crawl_id: id,
        },
        {},
        uuidv4(),
        10
      );
      await addCrawlJob(id, job.id);
    }

    res.json({ jobId: id });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
