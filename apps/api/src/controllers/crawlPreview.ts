import { Request, Response } from "express";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../src/types";
import { addWebScraperJob } from "../../src/services/queue-jobs";
import { isUrlBlocked } from "../../src/scraper/WebScraper/utils/blocklist";
import { Logger } from "../../src/lib/logger";

export async function crawlPreviewController(req: Request, res: Response) {
  try {
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Preview
    );
    if (!success) {
      return res.status(status).json({ error });
    }
    // authenticate on supabase
    const url = req.body.url;
    if (!url) {
      return res.status(400).json({ error: "Url is required" });
    }

    if (isUrlBlocked(url)) {
      return res.status(403).json({ error: "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it." });
    }

    const mode = req.body.mode ?? "crawl";
    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false, includeHtml: false, removeTags: [] };

    const job = await addWebScraperJob({
      url: url,
      mode: mode ?? "crawl", // fix for single urls not working
      crawlerOptions: { ...crawlerOptions, limit: 5, maxCrawledLinks: 5 },
      team_id: "preview",
      pageOptions: pageOptions,
      origin: "website-preview",
    });

    res.json({ jobId: job.id });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
