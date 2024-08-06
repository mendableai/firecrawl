import { ExtractorOptions, PageOptions } from './../lib/entities';
import { Request, Response } from "express";
import { billTeam, checkTeamCredits } from "../services/billing/credit_billing";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../types";
import { logJob } from "../services/logging/log_job";
import { Document } from "../lib/entities";
import { isUrlBlocked } from "../scraper/WebScraper/utils/blocklist"; // Import the isUrlBlocked function
import { numTokensFromString } from '../lib/LLM-extraction/helpers';
import { defaultPageOptions, defaultExtractorOptions, defaultTimeout, defaultOrigin } from '../lib/default-values';
import { addScrapeJob } from '../services/queue-jobs';
import { scrapeQueueEvents } from '../services/queue-service';
import { v4 as uuidv4 } from "uuid";
import { Logger } from '../lib/logger';

export async function scrapeHelper(
  jobId: string,
  req: Request,
  team_id: string,
  crawlerOptions: any,
  pageOptions: PageOptions,
  extractorOptions: ExtractorOptions,
  timeout: number,
  plan?: string
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

  const job = await addScrapeJob({
    url,
    mode: "single_urls",
    crawlerOptions,
    team_id,
    pageOptions,
    extractorOptions,
    origin: req.body.origin ?? defaultOrigin,
  });

  let doc;
  try {
    doc = (await job.waitUntilFinished(scrapeQueueEvents, timeout))[0]; //60 seconds timeout
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Job wait")) {
      return {
        success: false,
        error: "Request timed out",
        returnCode: 408,
      }
    } else {
      throw e;
    }
  }

  if (!doc) {
    console.error("!!! PANIC DOC IS", doc, job);
    return { success: true, error: "No page found", returnCode: 200, data: doc };
  }

  delete doc.index;
  delete doc.provider;

  // Remove rawHtml if pageOptions.rawHtml is false and extractorOptions.mode is llm-extraction-from-raw-html
  if (!pageOptions.includeRawHtml && extractorOptions.mode == "llm-extraction-from-raw-html") {
    delete doc.rawHtml;
  }

  return {
    success: true,
    data: doc,
    returnCode: 200,
  };
}

export async function scrapeController(req: Request, res: Response) {
  try {
    let earlyReturn = false;
    // make sure to authenticate user first, Bearer <token>
    const { success, team_id, error, status, plan } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Scrape
    );
    if (!success) {
      return res.status(status).json({ error });
    }

    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = { ...defaultPageOptions, ...req.body.pageOptions };
    const extractorOptions = { ...defaultExtractorOptions, ...req.body.extractorOptions };
    const origin = req.body.origin ?? defaultOrigin;
    let timeout = req.body.timeout ?? defaultTimeout;

    if (extractorOptions.mode.includes("llm-extraction")) {
      pageOptions.onlyMainContent = true;
      timeout = req.body.timeout ?? 90000;
    }

    const checkCredits = async () => {
      try {
        const { success: creditsCheckSuccess, message: creditsCheckMessage } = await checkTeamCredits(team_id, 1);
        if (!creditsCheckSuccess) {
          earlyReturn = true;
          return res.status(402).json({ error: "Insufficient credits" });
        }
      } catch (error) {
        Logger.error(error);
        earlyReturn = true;
        return res.status(500).json({ error: "Error checking team credits. Please contact hello@firecrawl.com for help." });
      }
    };


    // Async check saves 500ms in average case
    // Don't async check in llm extraction mode as it could be expensive
    if (extractorOptions.mode.includes("llm-extraction")) {
      await checkCredits();
    } else {
      checkCredits();
    }

    const jobId = uuidv4();

    const startTime = new Date().getTime();
    const result = await scrapeHelper(
      jobId,
      req,
      team_id,
      crawlerOptions,
      pageOptions,
      extractorOptions,
      timeout,
      plan
    );
    const endTime = new Date().getTime();
    const timeTakenInSeconds = (endTime - startTime) / 1000;
    const numTokens = (result.data && result.data.markdown) ? numTokensFromString(result.data.markdown, "gpt-3.5-turbo") : 0;

    if (result.success) {
      let creditsToBeBilled = 0; // billing for doc done on queue end
      const creditsPerLLMExtract = 50;

      if (extractorOptions.mode.includes("llm-extraction")) {
        // creditsToBeBilled = creditsToBeBilled + (creditsPerLLMExtract * filteredDocs.length);
        creditsToBeBilled += creditsPerLLMExtract;
      }

      let startTimeBilling = new Date().getTime();

      if (earlyReturn) {
        // Don't bill if we're early returning
        return;
      }
      const billingResult = await billTeam(
        team_id,
        creditsToBeBilled
      );
      if (!billingResult.success) {
        return res.status(402).json({
          success: false,
          error: "Failed to bill team. Insufficient credits or subscription not found.",
        });
      }
    }

    logJob({
      job_id: jobId,
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
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
