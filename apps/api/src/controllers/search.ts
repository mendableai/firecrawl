import { Request, Response } from "express";
import { WebScraperDataProvider } from "../scraper/WebScraper";
import { billTeam, checkTeamCredits } from "../services/billing/credit_billing";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../types";
import { logJob } from "../services/logging/log_job";
import { PageOptions, SearchOptions } from "../lib/entities";
import { search } from "../search";
import { isUrlBlocked } from "../scraper/WebScraper/utils/blocklist";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../lib/logger";

export async function searchHelper(
  jobId: string,
  req: Request,
  team_id: string,
  crawlerOptions: any,
  pageOptions: PageOptions,
  searchOptions: SearchOptions,
): Promise<{
  success: boolean;
  error?: string;
  data?: any;
  returnCode: number;
}> {
  const query = req.body.query;
  const advanced = false;
  if (!query) {
    return { success: false, error: "Query is required", returnCode: 400 };
  }

  const tbs = searchOptions.tbs ?? null;
  const filter = searchOptions.filter ?? null;
  const num_results = searchOptions.limit ?? 7;
  const num_results_buffer = Math.floor(num_results * 1.5);

  let res = await search({
    query: query,
    advanced: advanced,
    num_results: num_results_buffer,
    tbs: tbs,
    filter: filter,
    lang: searchOptions.lang ?? "en",
    country: searchOptions.country ?? "us",
    location: searchOptions.location,
  });

  let justSearch = pageOptions.fetchPageContent === false;
  

  if (justSearch) {
    const billingResult = await billTeam(
      team_id,
      res.length
    );
    if (!billingResult.success) {
      return {
        success: false,
        error:
          "Failed to bill team. Insufficient credits or subscription not found.",
        returnCode: 402,
      };
    }
    return { success: true, data: res, returnCode: 200 };
  }

  res = res.filter((r) => !isUrlBlocked(r.url));
  if (res.length > num_results) {
    res = res.slice(0, num_results);
  }

  if (res.length === 0) {
    return { success: true, error: "No search results found", returnCode: 200 };
  }

  // filter out social media links


  const a = new WebScraperDataProvider();
  await a.setOptions({
    jobId,
    mode: "single_urls",
    urls: res.map((r) => r.url).slice(0, searchOptions.limit ?? 7),
    crawlerOptions: {
      ...crawlerOptions,
    },
    pageOptions: {
      ...pageOptions,
      onlyMainContent: pageOptions?.onlyMainContent ?? true,
      fetchPageContent: pageOptions?.fetchPageContent ?? true,
      includeHtml: pageOptions?.includeHtml ?? false,
      removeTags: pageOptions?.removeTags ?? [],
      fallback: false,
    },
  });

  const docs = await a.getDocuments(false);
  
  if (docs.length === 0) {
    return { success: true, error: "No search results found", returnCode: 200 };
  }

  // make sure doc.content is not empty
  const filteredDocs = docs.filter(
    (doc: { content?: string }) => doc.content && doc.content.trim().length > 0
  );

  if (filteredDocs.length === 0) {
    return { success: true, error: "No page found", returnCode: 200, data: docs };
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

  return {
    success: true,
    data: filteredDocs,
    returnCode: 200,
  };
}

export async function searchController(req: Request, res: Response) {
  try {
    // make sure to authenticate user first, Bearer <token>
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Search
    );
    if (!success) {
      return res.status(status).json({ error });
    }
    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? {
      includeHtml: false,
      onlyMainContent: true,
      fetchPageContent: true,
      removeTags: [],
      fallback: false,
    };
    const origin = req.body.origin ?? "api";

    const searchOptions = req.body.searchOptions ?? { limit: 7 };

    const jobId = uuidv4();

    try {
      const { success: creditsCheckSuccess, message: creditsCheckMessage } =
        await checkTeamCredits(team_id, 1);
      if (!creditsCheckSuccess) {
        return res.status(402).json({ error: "Insufficient credits" });
      }
    } catch (error) {
      Logger.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
    const startTime = new Date().getTime();
    const result = await searchHelper(
      jobId,
      req,
      team_id,
      crawlerOptions,
      pageOptions,
      searchOptions,
    );
    const endTime = new Date().getTime();
    const timeTakenInSeconds = (endTime - startTime) / 1000;
    logJob({
      job_id: jobId,
      success: result.success,
      message: result.error,
      num_docs: result.data ? result.data.length : 0,
      docs: result.data,
      time_taken: timeTakenInSeconds,
      team_id: team_id,
      mode: "search",
      url: req.body.query,
      crawlerOptions: crawlerOptions,
      pageOptions: pageOptions,
      origin: origin,
    });
    return res.status(result.returnCode).json(result);
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
