import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  CrawlRequest,
  crawlRequestSchema,
  CrawlResponse,
  legacyCrawlerOptions,
  legacyScrapeOptions,
  RequestWithAuth,
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
import { addCrawlPreJob, addScrapeJob } from "../../services/queue-jobs";
import { Logger } from "../../lib/logger";
import { getJobPriority } from "../../lib/job-priority";
import { callWebhook } from "../../services/webhook";

export async function crawlController(
  req: RequestWithAuth<{}, CrawlResponse, CrawlRequest>,
  res: Response<CrawlResponse>
) {
  req.body = crawlRequestSchema.parse(req.body);

  const id = uuidv4();

  await logCrawl(id, req.auth.team_id);

  const { remainingCredits } = req.account;

  const crawlerOptions = legacyCrawlerOptions(req.body);
  const pageOptions = legacyScrapeOptions(req.body.scrapeOptions);

  // TODO: @rafa, is this right? copied from v0
  if (Array.isArray(crawlerOptions.includes)) {
    for (const x of crawlerOptions.includes) {
      try {
        new RegExp(x);
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }
  }

  if (Array.isArray(crawlerOptions.excludes)) {
    for (const x of crawlerOptions.excludes) {
      try {
        new RegExp(x);
      } catch (e) {
        return res.status(400).json({ success: false, error: e.message });
      }
    }
  }

  crawlerOptions.limit = Math.min(remainingCredits, crawlerOptions.limit);
  
  const sc: StoredCrawl = {
    originUrl: req.body.url,
    crawlerOptions,
    pageOptions,
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan,
  };

  await saveCrawl(id, sc);

  await addCrawlPreJob({
    auth: req.auth,
    crawlerOptions,
    pageOptions,
    webhook: req.body.webhook,
    url: req.body.url,
  }, id);

  if(req.body.webhook) {
    await callWebhook(req.auth.team_id, id, null, req.body.webhook, true, "crawl.started");
  }

  const protocol = process.env.ENV === "local" ? req.protocol : "https";
  
  return res.status(200).json({
    success: true,
    id,
    url: `${protocol}://${req.get("host")}/v1/crawl/${id}`,
  });
}


