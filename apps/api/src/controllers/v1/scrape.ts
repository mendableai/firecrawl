import { Request, Response } from "express";
import { Logger } from "../../lib/logger";
import {
  Document,
  legacyDocumentConverter,
  legacyExtractorOptions,
  legacyScrapeOptions,
  RequestWithAuth,
  ScrapeRequest,
  scrapeRequestSchema,
  ScrapeResponse,
} from "./types";
import { billTeam } from "../../services/billing/credit_billing";
import { v4 as uuidv4 } from "uuid";
import { numTokensFromString } from "../../lib/LLM-extraction/helpers";
import { addScrapeJob, waitForJob } from "../../services/queue-jobs";
import { logJob } from "../../services/logging/log_job";
import { getJobPriority } from "../../lib/job-priority";
import { PlanType } from "../../types";

export async function scrapeController(
  req: RequestWithAuth<{}, ScrapeResponse, ScrapeRequest>,
  res: Response<ScrapeResponse>
) {
  req.body = scrapeRequestSchema.parse(req.body);
  let earlyReturn = false;

  const origin = req.body.origin;
  const timeout = req.body.timeout;
  const pageOptions = legacyScrapeOptions(req.body);
  const extractorOptions = req.body.extract ? legacyExtractorOptions(req.body.extract) : undefined;
  const jobId = uuidv4();

  const startTime = new Date().getTime();
  const jobPriority = await getJobPriority({
    plan: req.auth.plan as PlanType,
    team_id: req.auth.team_id,
    basePriority: 10,
  });

  const job = await addScrapeJob(
    {
      url: req.body.url,
      mode: "single_urls",
      crawlerOptions: {},
      team_id: req.auth.team_id,
      pageOptions,
      extractorOptions,
      origin: req.body.origin,
      is_scrape: true,
    },
    {},
    jobId,
    jobPriority
  );

  let doc: any | undefined;
  try {
    doc = (await waitForJob(job.id, timeout))[0];
  } catch (e) {
    Logger.error(`Error in scrapeController: ${e}`);
    if (e instanceof Error && e.message.startsWith("Job wait")) {
      return res.status(408).json({
        success: false,
        error: "Request timed out",
      });
    } else {
      return res.status(500).json({
        success: false,
        error: `(Internal server error) - ${e && e?.message ? e.message : e} ${
          extractorOptions && extractorOptions.mode !== "markdown"
            ? " - Could be due to LLM parsing issues"
            : ""
        }`,
      });
    }
  }

  await job.remove();

  if (!doc) {
    console.error("!!! PANIC DOC IS", doc, job);
    return res.status(200).json({
      success: true,
      warning: "No page found",
      data: doc,
    });
  }

  delete doc.index;
  delete doc.provider;

  const endTime = new Date().getTime();
  const timeTakenInSeconds = (endTime - startTime) / 1000;
  const numTokens =
    doc && doc.markdown
      ? numTokensFromString(doc.markdown, "gpt-3.5-turbo")
      : 0;

  let creditsToBeBilled = 1; // Assuming 1 credit per document
  if (earlyReturn) {
    // Don't bill if we're early returning
    return;
  }
  if(req.body.extract && req.body.formats.includes("extract")) {
    creditsToBeBilled = 5;
  }

  billTeam(req.auth.team_id, creditsToBeBilled).catch(error => {
    Logger.error(`Failed to bill team ${req.auth.team_id} for ${creditsToBeBilled} credits: ${error}`);
    // Optionally, you could notify an admin or add to a retry queue here
  });

  if (!pageOptions || !pageOptions.includeRawHtml) {
    if (doc && doc.rawHtml) {
      delete doc.rawHtml;
    }
  }

  if(pageOptions && pageOptions.includeExtract) {
    if(!pageOptions.includeMarkdown && doc && doc.markdown) {
      delete doc.markdown;
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
    crawlerOptions: {},
    pageOptions: pageOptions,
    origin: origin,
    extractor_options: { mode: "markdown" },
    num_tokens: numTokens,
  });

  return res.status(200).json({
    success: true,
    data: legacyDocumentConverter(doc),
    scrape_id: origin?.includes("website") ? jobId : undefined,
  });
}
