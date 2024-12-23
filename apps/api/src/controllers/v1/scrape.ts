import { Response } from "express";
import { logger } from "../../lib/logger";
import {
  Document,
  RequestWithAuth,
  ScrapeRequest,
  scrapeRequestSchema,
  ScrapeResponse,
} from "./types";
import { billTeam } from "../../services/billing/credit_billing";
import { v4 as uuidv4 } from "uuid";
import { addScrapeJob, waitForJob } from "../../services/queue-jobs";
import { logJob } from "../../services/logging/log_job";
import { getJobPriority } from "../../lib/job-priority";
import { PlanType } from "../../types";
import { getScrapeQueue } from "../../services/queue-service";

export async function scrapeController(
  req: RequestWithAuth<{}, ScrapeResponse, ScrapeRequest>,
  res: Response<ScrapeResponse>,
) {
  req.body = scrapeRequestSchema.parse(req.body);
  let earlyReturn = false;

  const origin = req.body.origin;
  const timeout = req.body.timeout;
  const jobId = uuidv4();

  const startTime = new Date().getTime();
  const jobPriority = await getJobPriority({
    plan: req.auth.plan as PlanType,
    team_id: req.auth.team_id,
    basePriority: 10,
  });

  await addScrapeJob(
    {
      url: req.body.url,
      mode: "single_urls",
      team_id: req.auth.team_id,
      scrapeOptions: req.body,
      internalOptions: {},
      plan: req.auth.plan!,
      origin: req.body.origin,
      is_scrape: true,
    },
    {},
    jobId,
    jobPriority,
  );

  const totalWait =
    (req.body.waitFor ?? 0) +
    (req.body.actions ?? []).reduce(
      (a, x) => (x.type === "wait" ? (x.milliseconds ?? 0) : 0) + a,
      0,
    );

  let doc: Document;
  try {
    doc = await waitForJob<Document>(jobId, timeout + totalWait); // TODO: better types for this
  } catch (e) {
    logger.error(`Error in scrapeController: ${e}`, {
      jobId,
      scrapeId: jobId,
      startTime,
    });
    if (
      e instanceof Error &&
      (e.message.startsWith("Job wait") || e.message === "timeout")
    ) {
      return res.status(408).json({
        success: false,
        error: "Request timed out",
      });
    } else {
      return res.status(500).json({
        success: false,
        error: `(Internal server error) - ${e && e.message ? e.message : e}`,
      });
    }
  }

  await getScrapeQueue().remove(jobId);

  const endTime = new Date().getTime();
  const timeTakenInSeconds = (endTime - startTime) / 1000;
  const numTokens =
    doc && doc.extract
      ? // ? numTokensFromString(doc.markdown, "gpt-3.5-turbo")
        0 // TODO: fix
      : 0;

  let creditsToBeBilled = 1; // Assuming 1 credit per document
  if (earlyReturn) {
    // Don't bill if we're early returning
    return;
  }
  if (req.body.extract && req.body.formats.includes("extract")) {
    creditsToBeBilled = 5;
  }

  billTeam(req.auth.team_id, req.acuc?.sub_id, creditsToBeBilled).catch(
    (error) => {
      logger.error(
        `Failed to bill team ${req.auth.team_id} for ${creditsToBeBilled} credits: ${error}`,
      );
      // Optionally, you could notify an admin or add to a retry queue here
    },
  );

  if (!req.body.formats.includes("rawHtml")) {
    if (doc && doc.rawHtml) {
      delete doc.rawHtml;
    }
  }

  logJob({
    job_id: jobId,
    success: true,
    message: "Scrape completed",
    num_docs: 1,
    docs: [doc],
    time_taken: timeTakenInSeconds,
    team_id: req.auth.team_id,
    mode: "scrape",
    url: req.body.url,
    scrapeOptions: req.body,
    origin: origin,
    num_tokens: numTokens,
  });

  return res.status(200).json({
    success: true,
    data: doc,
    scrape_id: origin?.includes("website") ? jobId : undefined,
  });
}
