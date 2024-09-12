import { authMiddleware } from "../../routes/v1";
import { RateLimiterMode } from "../../types";
import { authenticateUser } from "../auth";
import { CrawlStatusParams, CrawlStatusResponse, Document, ErrorResponse, legacyDocumentConverter, RequestWithAuth } from "./types";
import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../../lib/logger";
import { getCrawl, getCrawlExpiry, getCrawlJobs, getDoneJobsOrdered, getDoneJobsOrderedLength, isCrawlFinished, isCrawlFinishedLocked } from "../../lib/crawl-redis";
import { getScrapeQueue } from "../../services/queue-service";
import { getJob, getJobs } from "./crawl-status";
import * as Sentry from "@sentry/node";

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
  let finished = false;

  const loop = async () => {
    if (finished) return;

    const jobIDs = await getCrawlJobs(req.params.jobId);

    if (jobIDs.length === doneJobIDs.length) {
      return close(ws, 1000, { type: "done" });
    }

    const notDoneJobIDs = jobIDs.filter(x => !doneJobIDs.includes(x));
    const jobStatuses = await Promise.all(notDoneJobIDs.map(async x => [x, await getScrapeQueue().getJobState(x)]));
    const newlyDoneJobIDs = jobStatuses.filter(x => x[1] === "completed" || x[1] === "failed").map(x => x[0]);

    for (const jobID of newlyDoneJobIDs) {
      const job = await getJob(jobID);

      if (job.returnvalue) {
        send(ws, {
          type: "document",
          data: legacyDocumentConverter(job.returnvalue),
        })
      } else {
        return close(ws, 3000, { type: "error", error: job.failedReason });
      }
    }

    doneJobIDs.push(...newlyDoneJobIDs);

    setTimeout(loop, 1000);
  };

  setTimeout(loop, 1000);

  doneJobIDs = await getDoneJobsOrdered(req.params.jobId);

  const jobIDs = await getCrawlJobs(req.params.jobId);
  const jobStatuses = await Promise.all(jobIDs.map(x => getScrapeQueue().getJobState(x)));
  const status: Exclude<CrawlStatusResponse, ErrorResponse>["status"] = sc.cancelled ? "cancelled" : jobStatuses.every(x => x === "completed") ? "completed" : jobStatuses.some(x => x === "failed") ? "failed" : "scraping";
  const doneJobs = await getJobs(doneJobIDs);
  const data = doneJobs.map(x => x.returnvalue);

  send(ws, {
    type: "catchup",
    data: {
      success: true,
      status,
      total: jobIDs.length,
      completed: doneJobIDs.length,
      creditsUsed: jobIDs.length,
      expiresAt: (await getCrawlExpiry(req.params.jobId)).toISOString(),
      data: data.map(x => legacyDocumentConverter(x)),
    }
  });

  if (status !== "scraping") {
    finished = true;
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
    Sentry.captureException(err);

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
