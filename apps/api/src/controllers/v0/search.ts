import { Request, Response } from "express";
import { WebScraperDataProvider } from "../../scraper/WebScraper";
import { billTeam, checkTeamCredits } from "../../services/billing/credit_billing";
import { authenticateUser } from "../auth";
import { PlanType, RateLimiterMode } from "../../types";
import { logJob } from "../../services/logging/log_job";
import { PageOptions, SearchOptions } from "../../lib/entities";
import { search } from "../../search";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../lib/logger";
import { getScrapeQueue } from "../../services/queue-service";
import { addScrapeJob, waitForJob } from "../../services/queue-jobs";
import * as Sentry from "@sentry/node";
import { getJobPriority } from "../../lib/job-priority";

export async function searchHelper(
  jobId: string,
  req: Request,
  team_id: string,
  crawlerOptions: any,
  pageOptions: PageOptions,
  searchOptions: SearchOptions,
  plan: PlanType
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
    billTeam(team_id, res.length).catch(error => {
      Logger.error(`Failed to bill team ${team_id} for ${res.length} credits: ${error}`);
      // Optionally, you could notify an admin or add to a retry queue here
    });
    return { success: true, data: res, returnCode: 200 };
  }

  res = res.filter((r) => !isUrlBlocked(r.url));
  if (res.length > num_results) {
    res = res.slice(0, num_results);
  }

  if (res.length === 0) {
    return { success: true, error: "No search results found", returnCode: 200 };
  }

  const jobPriority = await getJobPriority({plan, team_id, basePriority: 20});
  
  // filter out social media links

  const jobDatas = res.map(x => {
    const url = x.url;
    const uuid = uuidv4();
    return {
      name: uuid,
      data: {
        url,
        mode: "single_urls",
        crawlerOptions: crawlerOptions,
        team_id: team_id,
        pageOptions: pageOptions,
      },
      opts: {
        jobId: uuid,
        priority: jobPriority,
      }
    };
  })

  let jobs = [];
  if (Sentry.isInitialized()) {
    for (const job of jobDatas) {
      // add with sentry instrumentation
      jobs.push(await addScrapeJob(job.data as any, {}, job.opts.jobId));
    }
  } else {
    jobs = await getScrapeQueue().addBulk(jobDatas);
    await getScrapeQueue().addBulk(jobs);
  }

  const docs = (await Promise.all(jobs.map(x => waitForJob(x.id, 60000)))).map(x => x[0]);
  
  if (docs.length === 0) {
    return { success: true, error: "No search results found", returnCode: 200 };
  }

  await Promise.all(jobs.map(x => x.remove()));

  // make sure doc.content is not empty
  const filteredDocs = docs.filter(
    (doc: { content?: string }) => doc && doc.content && doc.content.trim().length > 0
  );

  if (filteredDocs.length === 0) {
    return { success: true, error: "No page found", returnCode: 200, data: docs };
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
    const { success, team_id, error, status, plan } = await authenticateUser(
      req,
      res,
      RateLimiterMode.Search
    );
    if (!success) {
      return res.status(status).json({ error });
    }
    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? {
      includeHtml: req.body.pageOptions?.includeHtml ?? false,
      onlyMainContent: req.body.pageOptions?.onlyMainContent ?? false,
      fetchPageContent: req.body.pageOptions?.fetchPageContent ?? true,
      removeTags: req.body.pageOptions?.removeTags ?? [],
      fallback: req.body.pageOptions?.fallback ?? false,
    };
    const origin = req.body.origin ?? "api";

    const searchOptions = req.body.searchOptions ?? { limit: 5 };
    
    const jobId = uuidv4();

    try {
      const { success: creditsCheckSuccess, message: creditsCheckMessage } =
        await checkTeamCredits(team_id, 1);
      if (!creditsCheckSuccess) {
        return res.status(402).json({ error: "Insufficient credits" });
      }
    } catch (error) {
      Sentry.captureException(error);
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
      plan
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
    if (error instanceof Error && error.message.startsWith("Job wait")) {
      return res.status(408).json({ error: "Request timed out" });
    }

    Sentry.captureException(error);
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
