import { ExtractorOptions, PageOptions } from './../lib/entities';
import { Request, Response } from "express";
import { WebScraperDataProvider } from "../scraper/WebScraper";
import { billTeam, checkTeamCredits } from "../services/billing/credit_billing";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../types";
import { logJob } from "../services/logging/log_job";
import { Document } from "../lib/entities";
import { isUrlBlocked } from "../scraper/WebScraper/utils/blocklist"; // Import the isUrlBlocked function
import { numTokensFromString } from '../lib/LLM-extraction/helpers';

export async function scrapeHelper(
  req: Request,
  team_id: string,
  crawlerOptions: any,
  pageOptions: PageOptions,
  extractorOptions: ExtractorOptions,
  timeout: number
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
    extractorOptions: extractorOptions,
  });

  const timeoutPromise = new Promise<{ success: boolean; error?: string; returnCode: number }>((_, reject) =>
    setTimeout(() => reject({ success: false, error: "Request timed out. Increase the timeout by passing `timeout` param to the request.", returnCode: 408 }), timeout)
  );

  const docsPromise = a.getDocuments(false);

  let docs;
  try {
    docs = await Promise.race([docsPromise, timeoutPromise]);
  } catch (error) {
    return error;
  }

  // make sure doc.content is not empty
  const filteredDocs = docs.filter(
    (doc: { content?: string }) => doc.content && doc.content.trim().length > 0
  );
  if (filteredDocs.length === 0) {
    return { success: true, error: "No page found", returnCode: 200 };
  }

  let creditsToBeBilled = filteredDocs.length;
  const creditsPerLLMExtract = 5;

  if (extractorOptions.mode === "llm-extraction") {
    creditsToBeBilled = creditsToBeBilled + (creditsPerLLMExtract * filteredDocs.length);
  }

  const billingResult = await billTeam(
    team_id,
    creditsToBeBilled
  );
  if (!billingResult.success) {
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
    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false, includeHtml: false, waitFor: 0, screenshot: false };
    const extractorOptions = req.body.extractorOptions ?? {
      mode: "markdown"
    }
    if (extractorOptions.mode === "llm-extraction") {
      pageOptions.onlyMainContent = true;
    }
    const origin = req.body.origin ?? "api";
    const timeout = req.body.timeout ?? 30000; // Default timeout of 30 seconds

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
      extractorOptions,
      timeout
    );
    const endTime = new Date().getTime();
    const timeTakenInSeconds = (endTime - startTime) / 1000;
    const numTokens = (result.data && result.data.markdown) ? numTokensFromString(result.data.markdown, "gpt-3.5-turbo") : 0;

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
      extractor_options: extractorOptions,
      num_tokens: numTokens,
    });
    return res.status(result.returnCode).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
