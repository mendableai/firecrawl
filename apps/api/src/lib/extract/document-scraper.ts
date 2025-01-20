import { Document, URLTrace, scrapeOptions } from "../../controllers/v1/types";
import { PlanType } from "../../types";
import { logger } from "../logger";
import { getScrapeQueue } from "../../services/queue-service";
import { waitForJob } from "../../services/queue-jobs";
import { addScrapeJob } from "../../services/queue-jobs";
import { getJobPriority } from "../job-priority";

interface ScrapeDocumentOptions {
  url: string;
  teamId: string;
  plan: PlanType;
  origin: string;
  timeout: number;
  isSingleUrl?: boolean;
}

export async function scrapeDocument(
  options: ScrapeDocumentOptions,
  urlTraces: URLTrace[],
): Promise<Document | null> {
  const trace = urlTraces.find((t) => t.url === options.url);
  if (trace) {
    trace.status = "scraped";
    trace.timing.scrapedAt = new Date().toISOString();
  }

  async function attemptScrape(timeout: number) {
    const jobId = crypto.randomUUID();
    const jobPriority = await getJobPriority({
      plan: options.plan,
      team_id: options.teamId,
      basePriority: 10,
    });

    await addScrapeJob(
      {
        url: options.url,
        mode: "single_urls",
        team_id: options.teamId,
        scrapeOptions: scrapeOptions.parse({}),
        internalOptions: {
          useCache: true,
        },
        plan: options.plan,
        origin: options.origin,
        is_scrape: true,
      },
      {},
      jobId,
      jobPriority,
    );

    const doc = await waitForJob<Document>(jobId, timeout);
    await getScrapeQueue().remove(jobId);

    if (trace) {
      trace.timing.completedAt = new Date().toISOString();
      trace.contentStats = {
        rawContentLength: doc.markdown?.length || 0,
        processedContentLength: doc.markdown?.length || 0,
        tokensUsed: 0,
      };
    }

    return doc;
  }

  try {
    try {
      return await attemptScrape(options.timeout);
    } catch (timeoutError) {
      if (options.isSingleUrl) {
        // For single URLs, try again with double timeout
        return await attemptScrape(options.timeout * 2);
      }
      throw timeoutError;
    }
  } catch (error) {
    logger.error(`Error in scrapeDocument: ${error}`);
    if (trace) {
      trace.status = "error";
      trace.error = error.message;
    }
    return null;
  }
}
