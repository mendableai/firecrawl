// import { ExtractorOptions, PageOptions } from './../../lib/entities';
import { Request, Response } from "express";
// import { WebScraperDataProvider } from "../../scraper/WebScraper";
// import { billTeam, checkTeamCredits } from "../../services/billing/credit_billing";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../types";
// import { logJob } from "../../services/logging/log_job";
// import { Document } from "../../lib/entities";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist"; // Import the isUrlBlocked function
// import { numTokensFromString } from '../../lib/LLM-extraction/helpers';
// import { defaultPageOptions, defaultExtractorOptions, defaultTimeout, defaultOrigin } from '../../../src/lib/default-values';
// import { v4 as uuidv4 } from "uuid";
import { Logger } from '../../lib/logger';
import { checkAndUpdateURL } from '../../lib/validateUrl';

export async function scrapeController(req: Request, res: Response) {
  let url = req.body.url;
  if (!url) {
    return { success: false, error: "Url is required", returnCode: 400 };
  }

  if (isUrlBlocked(url)) {
    return { success: false, error: "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.", returnCode: 403 };
  }

  try {
    url = checkAndUpdateURL(url);
  } catch (error) {
    return { success: false, error: "Invalid URL", returnCode: 400 };
  }

  // TODO: check req.body
  // mockup req.body
  // req.body = {
  //   url: "test",
  //   headers: {
  //     "x-key": "test"
  //   },
  //   formats: ["markdown", "html", "rawHtml", "content", "linksOnPage", "screenshot", "fullPageScreenshot"],
  //   includeTags: ["test"],
  //   excludeTags: ["test"],
  //   onlyMainContent: false,
  //   timeout: 30000,
  //   waitFor: number
  // }

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

    // check credits

    const result = {
      success: true,
      warning: "test",
      data: {
        markdown: "test",
        content: "test",
        html: "test",
        rawHtml: "test",
        linksOnPage: ["test1", "test2"],
        screenshot: "test",
        metadata: {
          title: "test",
          description: "test",
          language: "test",
          sourceURL: "test",
          statusCode: 200,
          error: "test"
        }
      }
    }

    return res.status(200).json(result);

    // const crawlerOptions = req.body.crawlerOptions ?? {};
    // const pageOptions = { ...defaultPageOptions, ...req.body.pageOptions };
    // const extractorOptions = { ...defaultExtractorOptions, ...req.body.extractorOptions };
    // const origin = req.body.origin ?? defaultOrigin;
    // let timeout = req.body.timeout ?? defaultTimeout;

    // if (extractorOptions.mode.includes("llm-extraction")) {
    //   pageOptions.onlyMainContent = true;
    //   timeout = req.body.timeout ?? 90000;
    // }

    // const checkCredits = async () => {
    //   try {
    //     const { success: creditsCheckSuccess, message: creditsCheckMessage } = await checkTeamCredits(team_id, 1);
    //     if (!creditsCheckSuccess) {
    //       earlyReturn = true;
    //       return res.status(402).json({ error: "Insufficient credits" });
    //     }
    //   } catch (error) {
    //     Logger.error(error);
    //     earlyReturn = true;
    //     return res.status(500).json({ error: "Error checking team credits. Please contact hello@firecrawl.com for help." });
    //   }
    // };


    // await checkCredits();

    // const jobId = uuidv4();

    // const startTime = new Date().getTime();
    // const result = await scrapeHelper(
    //   jobId,
    //   req,
    //   team_id,
    //   crawlerOptions,
    //   pageOptions,
    //   extractorOptions,
    //   timeout,
    //   plan
    // );
    // const endTime = new Date().getTime();
    // const timeTakenInSeconds = (endTime - startTime) / 1000;
    // const numTokens = (result.data && result.data.markdown) ? numTokensFromString(result.data.markdown, "gpt-3.5-turbo") : 0;

    // if (result.success) {
    //   let creditsToBeBilled = 1; // Assuming 1 credit per document
    //   const creditsPerLLMExtract = 50;

    //   if (extractorOptions.mode.includes("llm-extraction")) {
    //     // creditsToBeBilled = creditsToBeBilled + (creditsPerLLMExtract * filteredDocs.length);
    //     creditsToBeBilled += creditsPerLLMExtract;
    //   }

    //   let startTimeBilling = new Date().getTime();

    //   if (earlyReturn) {
    //     // Don't bill if we're early returning
    //     return;
    //   }
    //   const billingResult = await billTeam(
    //     team_id,
    //     creditsToBeBilled
    //   );
    //   if (!billingResult.success) {
    //     return res.status(402).json({
    //       success: false,
    //       error: "Failed to bill team. Insufficient credits or subscription not found.",
    //     });
    //   }
    // }

    // logJob({
    //   job_id: jobId,
    //   success: result.success,
    //   message: result.error,
    //   num_docs: 1,
    //   docs: [result.data],
    //   time_taken: timeTakenInSeconds,
    //   team_id: team_id,
    //   mode: "scrape",
    //   url: req.body.url,
    //   crawlerOptions: crawlerOptions,
    //   pageOptions: pageOptions,
    //   origin: origin, 
    //   extractor_options: extractorOptions,
    //   num_tokens: numTokens,
    // });

    
    // return res.status(result.returnCode).json(result);
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}


// export async function scrapeHelper(
//   jobId: string,
//   req: Request,
//   team_id: string,
//   crawlerOptions: any,
//   pageOptions: PageOptions,
//   extractorOptions: ExtractorOptions,
//   timeout: number,
//   plan?: string
// ): Promise<{
//   success: boolean;
//   error?: string;
//   data?: Document;
//   returnCode: number;
// }> {

  // const url = req.body.url;
  // if (!url) {
  //   return { success: false, error: "Url is required", returnCode: 400 };
  // }

  // if (isUrlBlocked(url)) {
  //   return { success: false, error: "Firecrawl currently does not support social media scraping due to policy restrictions. We're actively working on building support for it.", returnCode: 403 };
  // }

  // const a = new WebScraperDataProvider();
  // await a.setOptions({
  //   jobId,
  //   mode: "single_urls",
  //   urls: [url],
  //   crawlerOptions: {
  //     ...crawlerOptions,
  //   },
  //   pageOptions: pageOptions,
  //   extractorOptions: extractorOptions,
  // });

  // const timeoutPromise = new Promise<{ success: boolean; error?: string; returnCode: number }>((_, reject) =>
  //   setTimeout(() => reject({ success: false, error: "Request timed out. Increase the timeout by passing `timeout` param to the request.", returnCode: 408 }), timeout)
  // );

  // const docsPromise = a.getDocuments(false);

  // let docs;
  // try {
  //   docs = await Promise.race([docsPromise, timeoutPromise]);
  // } catch (error) {
  //   return error;
  // }

  // // make sure doc.content is not empty
  // let filteredDocs = docs.filter(
  //   (doc: { content?: string }) => doc.content && doc.content.trim().length > 0
  // );
  // if (filteredDocs.length === 0) {
  //   return { success: true, error: "No page found", returnCode: 200, data: docs[0] };
  // }

 
  // // Remove rawHtml if pageOptions.rawHtml is false and extractorOptions.mode is llm-extraction-from-raw-html
  // if (!pageOptions.includeRawHtml && extractorOptions.mode == "llm-extraction-from-raw-html") {
  //   filteredDocs.forEach(doc => {
  //     delete doc.rawHtml;
  //   });
  // }

  // return {
  //   success: true,
  //   data: filteredDocs[0],
  //   returnCode: 200,
  // };
// }