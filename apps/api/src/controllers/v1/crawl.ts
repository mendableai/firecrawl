import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { CrawlRequest, crawlRequestSchema, CrawlResponse, legacyCrawlerOptions, legacyScrapeOptions, RequestWithAuth } from "./types";
import { addCrawlJob, addCrawlJobs, crawlToCrawler, lockURL, lockURLs, saveCrawl, StoredCrawl } from "../../lib/crawl-redis";
import { logCrawl } from "../../services/logging/crawl_log";
import { getScrapeQueue } from "../../services/queue-service";
import { addScrapeJob } from "../../services/queue-jobs";
import { Logger } from "../../lib/logger";

export async function crawlController(req: RequestWithAuth<CrawlResponse, CrawlRequest>, res: Response<CrawlResponse>) {
  req.body = crawlRequestSchema.parse(req.body);
  
  const id = uuidv4();

  await logCrawl(id, req.auth.team_id);

  const crawlerOptions = legacyCrawlerOptions(req.body.crawlerOptions),
    pageOptions = legacyScrapeOptions(req.body.scrapeOptions);

  const sc: StoredCrawl = {
    originUrl: req.body.url,
    crawlerOptions,
    pageOptions,
    team_id: req.auth.team_id,
    createdAt: Date.now(),
  };

  const crawler = crawlToCrawler(id, sc);

  try {
    sc.robots = await crawler.getRobotsTxt();
  } catch (e) {
    Logger.debug(`[Crawl] Failed to get robots.txt (this is probably fine!): ${JSON.stringify(e)}`);
  }

  await saveCrawl(id, sc);

  const sitemap = sc.crawlerOptions.ignoreSitemap ? null : await crawler.tryGetSitemap();

  if (sitemap !== null) {
    const jobs = sitemap.map(x => {
      const url = x.url;
      const uuid = uuidv4();
      return {
        name: uuid,
        data: {
          url,
          mode: "single_urls",
          team_id: req.auth.team_id,
          crawlerOptions,
          pageOptions,
          origin: "api",
          crawl_id: id,
          sitemapped: true,
        },
        opts: {
          jobId: uuid,
          priority: 20,
        }
      };
    })

    await lockURLs(id, jobs.map(x => x.data.url));
    await addCrawlJobs(id, jobs.map(x => x.opts.jobId));
    await getScrapeQueue().addBulk(jobs);
  } else {
    await lockURL(id, sc, req.body.url);
    const job = await addScrapeJob({
      url: req.body.url,
      mode: "single_urls",
      crawlerOptions: crawlerOptions,
      team_id: req.auth.team_id,
      pageOptions: pageOptions,
      origin: "api",
      crawl_id: id,
    }, {
      priority: 15,
    });
    await addCrawlJob(id, job.id);
  }

  return res.status(200).json({
    success: true,
    id,
    url: `${req.protocol}://${req.get('host')}/v1/crawl/${id}`,
  });
}
