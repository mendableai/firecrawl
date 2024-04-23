import { Request, Response } from "express";
import { WebScraperDataProvider } from "../../src/scraper/WebScraper";
import { billTeam } from "../../src/services/billing/credit_billing";
import { checkTeamCredits } from "../../src/services/billing/credit_billing";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../src/types";
import { addWebScraperJob } from "../../src/services/queue-jobs";
import { isUrlBlocked } from "../../src/scraper/WebScraper/utils/blocklist";

export async function crawlController(req: Request, res: Response) {
  try {
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Crawl
    );
    if (!success) {
      return res.status(status).json({ error });
    }

    const { success: creditsCheckSuccess, message: creditsCheckMessage } =
      await checkTeamCredits(team_id, 1);
    if (!creditsCheckSuccess) {
      return res.status(402).json({ error: "Insufficient credits" });
    }

    const url = req.body.url;
    if (!url) {
      return res.status(400).json({ error: "Url is required" });
    }

    if (isUrlBlocked(url)) {
      return res.status(403).json({ error: "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it." });
    }
    
    const mode = req.body.mode ?? "crawl";
    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false };

    if (mode === "single_urls" && !url.includes(",")) {
      try {
        const a = new WebScraperDataProvider();
        await a.setOptions({
          mode: "single_urls",
          urls: [url],
          crawlerOptions: {
            returnOnlyUrls: true,
          },
          pageOptions: pageOptions,
        });

        const docs = await a.getDocuments(false, (progress) => {
          job.progress({
            current: progress.current,
            total: progress.total,
            current_step: "SCRAPING",
            current_url: progress.currentDocumentUrl,
          });
        });
        return res.json({
          success: true,
          documents: docs,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
      }
    }
    const job = await addWebScraperJob({
      url: url,
      mode: mode ?? "crawl", // fix for single urls not working
      crawlerOptions: { ...crawlerOptions },
      team_id: team_id,
      pageOptions: pageOptions,
      origin: req.body.origin ?? "api",
    });

    res.json({ jobId: job.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
