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
import { getJobPriority } from "../../lib/job-priority";
import { getScrapeQueue } from "../../services/queue-service";
import { supabaseGetJobById } from "../../lib/supabase-jobs";

export async function scrapeController(
  req: RequestWithAuth<{}, ScrapeResponse, ScrapeRequest>,
  res: Response<ScrapeResponse>,
) {
  const jobId = uuidv4();
  const preNormalizedBody = { ...req.body };
 
  logger.debug("Scrape " + jobId + " starting", {
    scrapeId: jobId,
    request: req.body,
    originalRequest: preNormalizedBody,
    teamId: req.auth.team_id,
    account: req.account,
  });

  req.body = scrapeRequestSchema.parse(req.body);
  let earlyReturn = false;

  const origin = req.body.origin;
  const timeout = req.body.timeout;

  const startTime = new Date().getTime();
  const jobPriority = await getJobPriority({
    team_id: req.auth.team_id,
    basePriority: 10,
  });
  // 

  await addScrapeJob(
    {
      url: req.body.url,
      mode: "single_urls",
      team_id: req.auth.team_id,
      scrapeOptions: req.body,
      internalOptions: {
        teamId: req.auth.team_id,
        saveScrapeResultToGCS: process.env.GCS_FIRE_ENGINE_BUCKET_NAME ? true : false,
        unnormalizedSourceURL: preNormalizedBody.url,
      },
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
    doc = await waitForJob(jobId, timeout + totalWait);
  } catch (e) {
    logger.error(`Error in scrapeController: ${e}`, {
      jobId,
      scrapeId: jobId,
      startTime,
    });
    
    let creditsToBeBilled = 0;

    if (req.body.agent?.model?.toLowerCase() === "fire-1" || req.body.extract?.agent?.model?.toLowerCase() === "fire-1" || req.body.jsonOptions?.agent?.model?.toLowerCase() === "fire-1") {
      if (process.env.USE_DB_AUTHENTICATION === "true") {
        // @Nick this is a hack pushed at 2AM pls help - mogery
        const job = await supabaseGetJobById(jobId);
        if (!job?.cost_tracking) {
          logger.warn("No cost tracking found for job", {
            jobId,
          });
        }
        creditsToBeBilled = Math.ceil((job?.cost_tracking?.totalCost ?? 1) * 1800);
      } else {
        creditsToBeBilled = 150;
      }
    }
  
    if (creditsToBeBilled > 0) {
      billTeam(req.auth.team_id, req.acuc?.sub_id, creditsToBeBilled).catch(
        (error) => {
          logger.error(
            `Failed to bill team ${req.auth.team_id} for ${creditsToBeBilled} credits: ${error}`,
          );
          // Optionally, you could notify an admin or add to a retry queue here
        },
      );
    }

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
  if ((req.body.extract && req.body.formats?.includes("extract")) || (req.body.formats?.includes("changeTracking") && req.body.changeTrackingOptions?.modes?.includes("json"))) {
    creditsToBeBilled = 5;
  }

  if (req.body.agent?.model?.toLowerCase() === "fire-1" || req.body.extract?.agent?.model?.toLowerCase() === "fire-1" || req.body.jsonOptions?.agent?.model?.toLowerCase() === "fire-1") {
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      // @Nick this is a hack pushed at 2AM pls help - mogery
      const job = await supabaseGetJobById(jobId);
      if (!job?.cost_tracking) {
        logger.warn("No cost tracking found for job", {
          jobId,
        });
      }
      creditsToBeBilled = Math.ceil((job?.cost_tracking?.totalCost ?? 1) * 1800);
    } else {
      creditsToBeBilled = 150;
    }
  }

  if (doc?.metadata?.proxyUsed === "stealth") {
    creditsToBeBilled += 4;
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

  return res.status(200).json({
    success: true,
    data: doc,
    scrape_id: origin?.includes("website") ? jobId : undefined,
  });
}
