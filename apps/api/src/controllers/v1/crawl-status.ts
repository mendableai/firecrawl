import { Response } from "express";
import { CrawlStatusParams, CrawlStatusResponse, ErrorResponse, legacyDocumentConverter, RequestWithAuth } from "./types";
import { getCrawl, getCrawlExpiry, getCrawlJobs, getDoneJobsOrdered, getDoneJobsOrderedLength } from "../../lib/crawl-redis";
import { getScrapeQueue } from "../../services/queue-service";
import { supabaseGetJobById, supabaseGetJobsById } from "../../lib/supabase-jobs";
import { configDotenv } from "dotenv";
configDotenv();

export async function getJob(id: string) {
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

export async function getJobs(ids: string[]) {
  const jobs = (await Promise.all(ids.map(x => getScrapeQueue().getJob(x)))).filter(x => x);
  
  if (process.env.USE_DB_AUTHENTICATION === "true") {
    const supabaseData = await supabaseGetJobsById(ids);

    supabaseData.forEach(x => {
      const job = jobs.find(y => y.id === x.job_id);
      if (job) {
        job.returnvalue = x.docs;
      }
    })
  }

  jobs.forEach(job => {
    job.returnvalue = Array.isArray(job.returnvalue) ? job.returnvalue[0] : job.returnvalue;
  });

  return jobs;
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
    let bytes = 0;
    const bytesLimit = 10485760; // 10 MiB in bytes
    const factor = 100; // chunking for faster retrieval

    for (let i = 0; i < doneJobsOrder.length && bytes < bytesLimit; i += factor) {
      // get current chunk and retrieve jobs
      const currentIDs = doneJobsOrder.slice(i, i+factor);
      const jobs = await getJobs(currentIDs);

      // iterate through jobs and add them one them one to the byte counter
      // both loops will break once we cross the byte counter
      for (let ii = 0; ii < jobs.length && bytes < bytesLimit; ii++) {
        const job = jobs[ii];
        doneJobs.push(job);
        bytes += JSON.stringify(legacyDocumentConverter(job.returnvalue)).length;
      }
    }

    // if we ran over the bytes limit, remove the last document
    if (bytes > bytesLimit) {
      doneJobs.splice(doneJobs.length - 1, 1);
    }
  } else {
    doneJobs = await getJobs(doneJobsOrder);
  }

  const data = doneJobs.map(x => x.returnvalue);

  const protocol = process.env.ENV === "local" ? req.protocol : "https";
  const nextURL = new URL(`${protocol}://${req.get("host")}/v1/crawl/${req.params.jobId}`);

  nextURL.searchParams.set("skip", (start + data.length).toString());

  if (typeof req.query.limit === "string") {
    nextURL.searchParams.set("limit", req.query.limit);
  }

  if (data.length > 0) {
    if (!doneJobs[0].data.pageOptions.includeRawHtml) {
      for (let ii = 0; ii < doneJobs.length; ii++) {
        if (data[ii]) {
          delete data[ii].rawHtml;
        }
      }
    }
  }

  res.status(200).json({
    success: true,
    status,
    completed: doneJobsLength,
    total: jobIDs.length,
    creditsUsed: jobIDs.length,
    expiresAt: (await getCrawlExpiry(req.params.jobId)).toISOString(),
    next:
      status !== "scraping" && (start + data.length) === doneJobsLength // if there's not gonna be any documents after this
        ? undefined
        : nextURL.href,
    data: data.map(x => legacyDocumentConverter(x)),
  });
}

