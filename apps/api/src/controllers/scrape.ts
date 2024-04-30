import { Request, Response } from "express";
import { WebScraperDataProvider } from "../scraper/WebScraper";
import { billTeam, checkTeamCredits } from "../services/billing/credit_billing";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../types";
import { logJob } from "../services/logging/log_job";
import { Document } from "../lib/entities";
import { isUrlBlocked } from "../scraper/WebScraper/utils/blocklist"; // Import the isUrlBlocked function

export async function scrapeHelper(
  req: Request,
  team_id: string,
  crawlerOptions: any,
  pageOptions: any,
  timeout: number = 20000
): Promise<{
  success: boolean;
  error?: string;
  data?: Document;
  returnCode: number;
}> {
  const url = req.body.url;
  if (!url) {
    return { success: false, error: "Url is required", returnCode: 400 };
  }

  if (isUrlBlocked(url)) {
    return { success: false, error: "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.", returnCode: 403 };
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

  const scrapingPromise = a.getDocuments(false);
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        error: "Timeout",
      });
    }, timeout);
  });
  
  try {
    const docs = await Promise.race([scrapingPromise, timeoutPromise]) as Document[];
    if ('error' in docs && docs.error == 'Timeout') {
      return { success: false, error: "Timeout exceeded", returnCode: 408 };
    }
    // make sure doc.content is not empty
    const filteredDocs = docs.filter(
      (doc: { content?: string }) => doc.content && doc.content.trim().length > 0
    );
    if (filteredDocs.length === 0) {
      return { success: true, error: "No page found", returnCode: 200 };
    }

    const billingResult = await billTeam(
      team_id,
      filteredDocs.length
    );
    if (!billingResult.success) {
      return {
        success: false,
        error:
          "Failed to bill team. Insufficient credits or subscription not found.",
        returnCode: 402,
      };
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
  } catch (error) {
    console.error(error);
    return { success: false, error: "Internal server error", returnCode: 500 };
  }
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
    const origin = req.body.origin ?? "api";
    const timeout = req.body.timeout;

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
    const startTime = new Date().getTime();
    const result = await scrapeHelper(
      req,
      team_id,
      crawlerOptions,
      pageOptions,
      timeout
    );
    const endTime = new Date().getTime();
    const timeTakenInSeconds = (endTime - startTime) / 1000;
    logJob({
      success: result.success,
      message: result.error,
      num_docs: 1,
      docs: [result.data],
      time_taken: timeTakenInSeconds,
      team_id: team_id,
      mode: "scrape",
      url: req.body.url,
      crawlerOptions: crawlerOptions,
      pageOptions: pageOptions,
      origin: origin,
    });
    return res.status(result.returnCode).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
