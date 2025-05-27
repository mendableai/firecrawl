import { Response } from "express";
import {
  Document,
  RequestWithAuth,
  SearchRequest,
  SearchResponse,
  searchRequestSchema,
  ScrapeOptions,
  TeamFlags,
} from "./types";
import { billTeam } from "../../services/billing/credit_billing";
import { v4 as uuidv4 } from "uuid";
import { addScrapeJob, waitForJob } from "../../services/queue-jobs";
import { logJob } from "../../services/logging/log_job";
import { getJobPriority } from "../../lib/job-priority";
import { Mode } from "../../types";
import { getScrapeQueue } from "../../services/queue-service";
import { search } from "../../search";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import * as Sentry from "@sentry/node";
import { BLOCKLISTED_URL_MESSAGE } from "../../lib/strings";
import { logger as _logger } from "../../lib/logger";
import type { Logger } from "winston";
import { getJobFromGCS } from "../../lib/gcs-jobs";
import { CostTracking } from "../../lib/extract/extraction-service";

// Used for deep research
export async function searchAndScrapeSearchResult(
  query: string,
  options: {
    teamId: string;
    origin: string;
    timeout: number;
    scrapeOptions: ScrapeOptions;
  },
  logger: Logger,
  costTracking: CostTracking,
  flags: TeamFlags,
): Promise<Document[]> {
  try {
    const searchResults = await search({
      query,
      num_results: 5
  });

  const documents = await Promise.all(
    searchResults.map(result => 
      scrapeSearchResult(
        {
          url: result.url,
          title: result.title,
          description: result.description
        },
        options,
        logger,
        costTracking,
        flags
      )
    )
  );

    return documents;
  } catch (error) {
    return [];
  }
}

async function scrapeSearchResult(
  searchResult: { url: string; title: string; description: string },
  options: {
    teamId: string;
    origin: string;
    timeout: number;
    scrapeOptions: ScrapeOptions;
  },
  logger: Logger,
  costTracking: CostTracking,
  flags: TeamFlags,
): Promise<Document> {
  const jobId = uuidv4();
  const jobPriority = await getJobPriority({
    team_id: options.teamId,
    basePriority: 10,
  });

  try {
    if (isUrlBlocked(searchResult.url, flags)) {
      throw new Error("Could not scrape url: " + BLOCKLISTED_URL_MESSAGE);
    }
    logger.info("Adding scrape job", {
      scrapeId: jobId,
      url: searchResult.url,
      teamId: options.teamId,
      origin: options.origin,
    });
    await addScrapeJob(
      {
        url: searchResult.url,
        mode: "single_urls" as Mode,
        team_id: options.teamId,
        scrapeOptions: options.scrapeOptions,
        internalOptions: { teamId: options.teamId, useCache: true },
        origin: options.origin,
        is_scrape: true,
        
      },
      {},
      jobId,
      jobPriority,
    );

    const doc: Document = await waitForJob(jobId, options.timeout);
    
    logger.info("Scrape job completed", {
      scrapeId: jobId,
      url: searchResult.url,
      teamId: options.teamId,
      origin: options.origin,
    });
    await getScrapeQueue().remove(jobId);

    // Move SERP results to top level
    return {
      title: searchResult.title,
      description: searchResult.description,
      url: searchResult.url,
      ...doc,
    };
  } catch (error) {
    logger.error(`Error in scrapeSearchResult: ${error}`, {
      scrapeId: jobId,
      url: searchResult.url,
      teamId: options.teamId,
    });

    let statusCode = 0;
    if (error?.message?.includes("Could not scrape url")) {
      statusCode = 403;
    }
    // Return a minimal document with SERP results at top level
    return {
      title: searchResult.title,
      description: searchResult.description,
      url: searchResult.url,
      metadata: {
        statusCode,
        error: error.message,
        proxyUsed: "basic",
      },
    };
  }
}

export async function searchController(
  req: RequestWithAuth<{}, SearchResponse, SearchRequest>,
  res: Response<SearchResponse>,
) {
  const jobId = uuidv4();
  let logger = _logger.child({
    jobId,
    teamId: req.auth.team_id,
    module: "search",
    method: "searchController",
  });

  let responseData: SearchResponse = {
    success: true,
    data: [],
  };
  const startTime = new Date().getTime();
  const costTracking = new CostTracking();

  try {
    req.body = searchRequestSchema.parse(req.body);

    logger = logger.child({
      query: req.body.query,
      origin: req.body.origin,
    });

    let limit = req.body.limit;

    // Buffer results by 50% to account for filtered URLs
    const num_results_buffer = Math.floor(limit * 2);

    logger.info("Searching for results");

    let searchResults = await search({
      query: req.body.query,
      advanced: false,
      num_results: num_results_buffer,
      tbs: req.body.tbs,
      filter: req.body.filter,
      lang: req.body.lang,
      country: req.body.country,
      location: req.body.location,
    });

    if (req.body.ignoreInvalidURLs) {
      searchResults = searchResults.filter((result) => !isUrlBlocked(result.url, req.acuc?.flags ?? null));
    }

    logger.info("Searching completed", {
      num_results: searchResults.length,
    });

    // Filter blocked URLs early to avoid unnecessary billing
    if (searchResults.length > limit) {
      searchResults = searchResults.slice(0, limit);
    }

    if (searchResults.length === 0) {
      logger.info("No search results found");
      responseData.warning = "No search results found";
    } else if (
      !req.body.scrapeOptions.formats ||
      req.body.scrapeOptions.formats.length === 0
    ) {
      responseData.data = searchResults.map((r) => ({
        url: r.url,
        title: r.title,
        description: r.description,
      })) as Document[];
    } else {
      logger.info("Scraping search results");
      const scrapePromises = searchResults.map((result) =>
        scrapeSearchResult(result, {
          teamId: req.auth.team_id,
          origin: req.body.origin,
          timeout: req.body.timeout,
          scrapeOptions: req.body.scrapeOptions,
        }, logger, costTracking, req.acuc?.flags ?? null),
      );

      const docs = await Promise.all(scrapePromises);
      logger.info("Scraping completed", {
        num_docs: docs.length,
      });

      const filteredDocs = docs.filter(
        (doc) =>
          doc.serpResults || (doc.markdown && doc.markdown.trim().length > 0),
      );

      logger.info("Filtering completed", {
        num_docs: filteredDocs.length,
      });

      if (filteredDocs.length === 0) {
        responseData.data = docs;
        responseData.warning = "No content found in search results";
      } else {
        responseData.data = filteredDocs;
      }
    }

    // Bill team once for all successful results
    billTeam(req.auth.team_id, req.acuc?.sub_id, responseData.data.length).catch((error) => {
      logger.error(
        `Failed to bill team ${req.auth.team_id} for ${responseData.data.length} credits: ${error}`,
      );
    });

    const endTime = new Date().getTime();
    const timeTakenInSeconds = (endTime - startTime) / 1000;

    logger.info("Logging job", {
      num_docs: responseData.data.length,
      time_taken: timeTakenInSeconds,
    });

    logJob({
      job_id: jobId,
      success: true,
      num_docs: responseData.data.length,
      docs: responseData.data,
      time_taken: timeTakenInSeconds,
      team_id: req.auth.team_id,
      mode: "search",
      url: req.body.query,
      scrapeOptions: req.body.scrapeOptions,
      origin: req.body.origin,
      cost_tracking: costTracking,
    });

    return res.status(200).json(responseData);

  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Job wait") || error.message === "timeout")
    ) {
      return res.status(408).json({
        success: false,
        error: "Request timed out",
      });
    }

    Sentry.captureException(error);
    logger.error("Unhandled error occurred in search", { error });
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
