import { Response } from "express";
import { CrawlStatusParams, CrawlStatusResponse, ErrorResponse, legacyDocumentConverter, RequestWithAuth } from "./types";
import { getCrawl, getCrawlExpiry, getCrawlJobs, getDoneJobsOrdered, getDoneJobsOrderedLength } from "../../lib/crawl-redis";
import { getScrapeQueue } from "../../services/queue-service";
import { supabaseGetJobById } from "../../lib/supabase-jobs";

async function getJob(id: string) {
  console.log("getting job", id);
  const job = await getScrapeQueue().getJob(id);
  if (!job) return job;
  
  if (process.env.USE_DB_AUTHENTICATION === "true") {
    const supabaseData = await supabaseGetJobById(id);

    if (supabaseData) {
      job.returnvalue = supabaseData.docs;
    }
  }

  job.returnvalue = Array.isArray(job.returnvalue) ? job.returnvalue[0] : job.returnvalue;

  return job;
}

export async function crawlStatusController(req: RequestWithAuth<CrawlStatusParams, undefined, CrawlStatusResponse>, res: Response<CrawlStatusResponse>) {
  const sc = await getCrawl(req.params.jobId);
  if (!sc) {
    return res.status(404).json({ success: false, error: "Job not found" });
  }

  if (sc.team_id !== req.auth.team_id) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }

  const start = typeof req.query.skip === "string" ? parseInt(req.query.skip, 10) : 0;
  const end = typeof req.query.limit === "string" ? (start + parseInt(req.query.limit, 10) - 1) : undefined;

  const jobIDs = await getCrawlJobs(req.params.jobId);
  const jobStatuses = await Promise.all(jobIDs.map(x => getScrapeQueue().getJobState(x)));
  const status: Exclude<CrawlStatusResponse, ErrorResponse>["status"] = sc.cancelled ? "cancelled" : jobStatuses.every(x => x === "completed") ? "completed" : jobStatuses.some(x => x === "failed") ? "failed" : "scraping";
  const doneJobsLength = await getDoneJobsOrderedLength(req.params.jobId);
  const doneJobsOrder = await getDoneJobsOrdered(req.params.jobId, start, end ?? -1);

  let doneJobs = [];

  if (end === undefined) { // determine 10 megabyte limit
    let bytes = 0, used = 0;
    
    while (bytes < 10485760 && used < doneJobsOrder.length) {
      const job = await getJob(doneJobsOrder[used]);

      doneJobs.push(job);
      bytes += JSON.stringify(legacyDocumentConverter(job.returnvalue)).length;
      used++;
    }

    doneJobs.splice(doneJobs.length - 1, 1);
    used--;
  } else {
    doneJobs = (await Promise.all(doneJobsOrder.map(async x => await getJob(x))));
  }

  const data = doneJobs.map(x => x.returnvalue);

  const nextURL = new URL(`${req.protocol}://${req.get("host")}/v1/crawl/${req.params.jobId}`);

  nextURL.searchParams.set("skip", (start + data.length).toString());

  if (typeof req.query.limit === "string") {
    nextURL.searchParams.set("limit", req.query.limit);
  }

  res.status(200).json({
    status,
    totalCount: jobIDs.length,
    creditsUsed: jobIDs.length,
    expiresAt: (await getCrawlExpiry(req.params.jobId)).toISOString(),
    next:
      status !== "scraping" && (start + data.length) === doneJobsLength // if there's not gonna be any documents after this
        ? undefined
        : nextURL.href,
    data: data.map(x => legacyDocumentConverter(x)),
  });
}

