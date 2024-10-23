import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  BatchScrapeRequest,
  batchScrapeRequestSchema,
  CrawlResponse,
  legacyScrapeOptions,
  RequestWithAuth,
} from "./types";
import {
  addCrawlJobs,
  lockURLs,
  saveCrawl,
  StoredCrawl,
} from "../../lib/crawl-redis";
import { logCrawl } from "../../services/logging/crawl_log";
import { getScrapeQueue } from "../../services/queue-service";
import { getJobPriority } from "../../lib/job-priority";

export async function batchScrapeController(
  req: RequestWithAuth<{}, CrawlResponse, BatchScrapeRequest>,
  res: Response<CrawlResponse>
) {
  req.body = batchScrapeRequestSchema.parse(req.body);

  const id = uuidv4();

  await logCrawl(id, req.auth.team_id);

  let { remainingCredits } = req.account;
  const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
  if(!useDbAuthentication){
    remainingCredits = Infinity;
  }

  const pageOptions = legacyScrapeOptions(req.body);

  const sc: StoredCrawl = {
    crawlerOptions: null,
    pageOptions,
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan,
  };

  await saveCrawl(id, sc);

  let jobPriority = 20;

  // If it is over 1000, we need to get the job priority,
  // otherwise we can use the default priority of 20
  if(req.body.urls.length > 1000){
    // set base to 21
    jobPriority = await getJobPriority({plan: req.auth.plan, team_id: req.auth.team_id, basePriority: 21})
  }

  const jobs = req.body.urls.map((x) => {
    const uuid = uuidv4();
    return {
      name: uuid,
      data: {
        url: x,
        mode: "single_urls",
        team_id: req.auth.team_id,
        plan: req.auth.plan,
        crawlerOptions: null,
        pageOptions,
        origin: "api",
        crawl_id: id,
        sitemapped: true,
        v1: true,
      },
      opts: {
        jobId: uuid,
        priority: 20,
      },
    };
  });

  await lockURLs(
    id,
    jobs.map((x) => x.data.url)
  );
  await addCrawlJobs(
    id,
    jobs.map((x) => x.opts.jobId)
  );
  await getScrapeQueue().addBulk(jobs);

  const protocol = process.env.ENV === "local" ? req.protocol : "https";
  
  return res.status(200).json({
    success: true,
    id,
    url: `${protocol}://${req.get("host")}/v1/batch/scrape/${id}`,
  });
}


