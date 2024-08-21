import { authMiddleware } from "../../routes/v1";
import { RateLimiterMode } from "../../types";
import { authenticateUser } from "../v0/auth";
import { CrawlStatusParams, CrawlStatusResponse, Document, ErrorResponse, legacyDocumentConverter, RequestWithAuth } from "./types";
import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../lib/logger";
import { getCrawl, getCrawlExpiry, getCrawlJobs, getDoneJobsOrdered, getDoneJobsOrderedLength, isCrawlFinished, isCrawlFinishedLocked } from "../../lib/crawl-redis";
import { getScrapeQueue, scrapeQueueEvents } from "../../services/queue-service";
import { getJob, getJobs } from "./crawl-status";

type ErrorMessage = {
  type: "error",
  error: string,
}

type CatchupMessage = {
  type: "catchup",
  data: CrawlStatusResponse,
}

type DocumentMessage = {
  type: "document",
  data: Document,
}

type DoneMessage = { type: "done" }

type Message = ErrorMessage | CatchupMessage | DoneMessage | DocumentMessage;

function send(ws: WebSocket, msg: Message) {
  if (ws.readyState === 1) {
    return new Promise((resolve, reject) => {
      ws.send(JSON.stringify(msg), (err) => {
        if (err) reject(err);
        else resolve(null);
      });
    });
  }
}

function close(ws: WebSocket, code: number, msg: Message) {
  if (ws.readyState <= 1) {
    ws.close(code, JSON.stringify(msg));
  }
}

async function crawlStatusWS(ws: WebSocket, req: RequestWithAuth<CrawlStatusParams, undefined, undefined>) {
  const sc = await getCrawl(req.params.jobId);
  if (!sc) {
    return close(ws, 1008, { type: "error", error: "Job not found" });
  }

  if (sc.team_id !== req.auth.team_id) {
    return close(ws, 3003, { type: "error", error: "Forbidden" });
  }

  let doneJobIDs = [];

  const completedListener = async e => {
    const job = await getScrapeQueue().getJob(e.jobId)
    if (job.data.crawl_id === req.params.jobId) {
      if (doneJobIDs.includes(job.id)) return;
      const j = await getJob(job.id);
      if (j.returnvalue) {
        send(ws, {
          type: "document",
          data: legacyDocumentConverter(j.returnvalue),
        });
        if (await isCrawlFinishedLocked(req.params.jobId)) {
          await new Promise((resolve) => setTimeout(() => resolve(true), 5000)) // wait for last events to pour in
          scrapeQueueEvents.removeListener("completed", completedListener);
          close(ws, 1000, { type: "done" })
        }
      } else {
        // FAILED
      }
    }
  };

  // TODO: handle failed jobs

  scrapeQueueEvents.addListener("completed", completedListener);

  doneJobIDs = await getDoneJobsOrdered(req.params.jobId);

  const jobIDs = await getCrawlJobs(req.params.jobId);
  const jobStatuses = await Promise.all(jobIDs.map(x => getScrapeQueue().getJobState(x)));
  const status: Exclude<CrawlStatusResponse, ErrorResponse>["status"] = sc.cancelled ? "cancelled" : jobStatuses.every(x => x === "completed") ? "completed" : jobStatuses.some(x => x === "failed") ? "failed" : "scraping";
  const doneJobs = await getJobs(doneJobIDs);
  const data = doneJobs.map(x => x.returnvalue);

  send(ws, {
    type: "catchup",
    data: {
      status,
      totalCount: jobIDs.length,
      creditsUsed: jobIDs.length,
      expiresAt: (await getCrawlExpiry(req.params.jobId)).toISOString(),
      data: data.map(x => legacyDocumentConverter(x)),
    }
  });

  if (status !== "scraping") {
    scrapeQueueEvents.removeListener("completed", completedListener);
    return close(ws, 1000, { type: "done" });
  }
}

// Basically just middleware and error wrapping
export async function crawlStatusWSController(ws: WebSocket, req: RequestWithAuth<CrawlStatusParams, undefined, undefined>) {
  try {
    const { success, team_id, error, status, plan } = await authenticateUser(
      req,
      null,
      RateLimiterMode.CrawlStatus,
    );

    if (!success) {
      return close(ws, 3000, {
        type: "error",
        error,
      });
    }

    req.auth = { team_id, plan };

    await crawlStatusWS(ws, req);
  } catch (err) {
    const id = uuidv4();
    let verbose = JSON.stringify(err);
    if (verbose === "{}") {
      if (err instanceof Error) {
        verbose = JSON.stringify({
          message: err.message,
          name: err.name,
          stack: err.stack,
        });
      }
    }

    Logger.error("Error occurred in WebSocket! (" + req.path + ") -- ID " + id + " -- " + verbose);
    return close(ws, 1011, {
      type: "error",
      error: "An unexpected error occurred. Please contact hello@firecrawl.com for help. Your exception ID is " + id
    });
  }
}
