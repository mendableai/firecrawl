import { Request, Response } from "express";
import { WebScraperDataProvider } from "../../src/scraper/WebScraper";
import { billTeam } from "../../src/services/billing/credit_billing";
import { checkTeamCredits } from "../../src/services/billing/credit_billing";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../src/types";
import { logJob } from "../../src/services/logging/log_job";
import { Document } from "../../src/lib/entities";

export async function scrapeHelper(
  req: Request,
  team_id: string,
  crawlerOptions: any,
  pageOptions: any
): Promise<{
  success: boolean;
  error?: string;
  data?: Document;
  returnCode?: number;
}> {
  const url = req.body.url;
  if (!url) {
    return { success: false, error: "Url is required", returnCode: 400 };
  }

  const a = new WebScraperDataProvider();
  await a.setOptions({
    mode: "single_urls",
    urls: [url],
    crawlerOptions: {
      ...crawlerOptions,
    },
    pageOptions: pageOptions,
  });

  const docs = await a.getDocuments(false);
  // make sure doc.content is not empty
  const filteredDocs = docs.filter(
    (doc: { content?: string }) => doc.content && doc.content.trim().length > 0
  );
  if (filteredDocs.length === 0) {
    return { success: true, error: "No page found", returnCode: 200 };
  }
  const { success, credit_usage } = await billTeam(
    team_id,
    filteredDocs.length
  );
  if (!success) {
    return {
      success: false,
      error:
        "Failed to bill team. Insufficient credits or subscription not found.",
      returnCode: 402,
    };
  }
  return {
    success: true,
    data: filteredDocs[0],
    returnCode: 200,
  };
}

export async function scrapeController(req: Request, res: Response) {
  try {
    // make sure to authenticate user first, Bearer <token>
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Scrape
    );
    if (!success) {
      return res.status(status).json({ error });
    }
    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false };

    try {
      const { success: creditsCheckSuccess, message: creditsCheckMessage } =
        await checkTeamCredits(team_id, 1);
      if (!creditsCheckSuccess) {
        return res.status(402).json({ error: "Insufficient credits" });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }

    const result = await scrapeHelper(
      req,
      team_id,
      crawlerOptions,
      pageOptions
    );
    logJob({
      success: result.success,
      message: result.error,
      num_docs: 1,
      docs: [result.data],
      time_taken: 0,
      team_id: team_id,
      mode: "scrape",
      url: req.body.url,
      crawlerOptions: crawlerOptions,
      pageOptions: pageOptions,
    });
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
