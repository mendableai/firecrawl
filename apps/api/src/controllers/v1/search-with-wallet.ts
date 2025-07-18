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
import { v4 as uuidv4 } from "uuid";
import { addScrapeJob, waitForJob } from "../../services/queue-jobs";
import { getJobPriority } from "../../lib/job-priority";
import { Mode } from "../../types";
import { getScrapeQueue } from "../../services/queue-service";
import { search } from "../../search";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { BLOCKLISTED_URL_MESSAGE } from "../../lib/strings";
import { CostTracking } from "../../lib/extract/extraction-service";
import { supabase_service } from "../../services/supabase";

interface DocumentWithCostTracking {
  document: Document;
  costTracking: ReturnType<typeof CostTracking.prototype.toJSON>;
}

// Used for deep research
export async function searchAndScrapeSearchResultWithWallet(
  query: string,
  options: {
    teamId: string;
    origin: string;
    timeout: number;
    scrapeOptions: ScrapeOptions;
  },
  flags: TeamFlags,
): Promise<DocumentWithCostTracking[]> {
  try {
    const searchResults = await search({
      query,
      num_results: 5,
    });

    const documentsWithCostTracking = await Promise.all(
      searchResults.map((result) =>
        scrapeSearchResultWithWallet(
          {
            url: result.url,
            title: result.title,
            description: result.description,
          },
          options,
          flags,
        ),
      ),
    );

    return documentsWithCostTracking;
  } catch (error) {
    return [];
  }
}

async function scrapeSearchResultWithWallet(
  searchResult: { url: string; title: string; description: string },
  options: {
    teamId: string;
    origin: string;
    timeout: number;
    scrapeOptions: ScrapeOptions;
  },
  flags: TeamFlags,
  directToBullMQ: boolean = false,
  isSearchPreview: boolean = false,
): Promise<DocumentWithCostTracking> {
  const jobId = uuidv4();
  const jobPriority = await getJobPriority({
    team_id: options.teamId,
    basePriority: 10,
  });
  
  const costTracking = new CostTracking();

  const zeroDataRetention = flags?.forceZDR ?? false;

  try {
    if (isUrlBlocked(searchResult.url, flags)) {
      throw new Error("Could not scrape url: " + BLOCKLISTED_URL_MESSAGE);
    }
    await addScrapeJob(
      {
        url: searchResult.url,
        mode: "single_urls" as Mode,
        team_id: options.teamId,
        scrapeOptions: {
          ...options.scrapeOptions,
          maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
        },
        internalOptions: { teamId: options.teamId, bypassBilling: true, zeroDataRetention },
        origin: options.origin,
        is_scrape: true,
        startTime: Date.now(),
        zeroDataRetention,
      },
      {},
      jobId,
      jobPriority,
      directToBullMQ,
    );

    const doc: Document = await waitForJob(jobId, options.timeout);
    
    await getScrapeQueue().remove(jobId);

    const document = {
      title: searchResult.title,
      description: searchResult.description,
      url: searchResult.url,
      ...doc,
    };

    let costTracking: ReturnType<typeof CostTracking.prototype.toJSON>;
    if (process.env.USE_DB_AUTHENTICATION === "true") {
      const { data: costTrackingResponse, error: costTrackingError } = await supabase_service.from("firecrawl_jobs")
        .select("cost_tracking")
        .eq("job_id", jobId);
      
      if (costTrackingError) {
        throw costTrackingError;
      }
      
      costTracking = costTrackingResponse?.[0]?.cost_tracking;
    } else {
      costTracking = new CostTracking().toJSON();
    }

    return {
      document,
      costTracking,
    };
  } catch (error) {

    let statusCode = 0;
    if (error?.message?.includes("Could not scrape url")) {
      statusCode = 403;
    }
    
    const document: Document = {
      title: searchResult.title,
      description: searchResult.description,
      url: searchResult.url,
      metadata: {
        statusCode,
        error: error.message,
        proxyUsed: "basic",
      },
    };

    return {
      document,
      costTracking: new CostTracking().toJSON(),
    };
  }
}

export async function searchWithWalletController(
  req: RequestWithAuth<{}, SearchResponse, SearchRequest>,
  res: Response<SearchResponse & { request?: any; }>,
) {
  if (req.acuc?.flags?.forceZDR) {
    return res.status(400).json({ success: false, error: "Your team has zero data retention enabled. This is not supported on search-with-wallet. Please contact support@firecrawl.com to unblock this feature." });
  }

  let responseData: SearchResponse = {
    success: true,
    data: [],
  };
  const startTime = new Date().getTime();
  const isSearchPreview = process.env.SEARCH_PREVIEW_TOKEN !== undefined && process.env.SEARCH_PREVIEW_TOKEN === req.body.__searchPreviewToken;

  try {
    req.body = searchRequestSchema.parse(req.body);

    let limit = req.body.limit;

    // Buffer results by 50% to account for filtered URLs
    const num_results_buffer = Math.floor(limit * 2);

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
      searchResults = searchResults.filter(
        (result) => !isUrlBlocked(result.url, req.acuc?.flags ?? null),
      );
    }

    // Filter blocked URLs early to avoid unnecessary billing
    if (searchResults.length > limit) {
      searchResults = searchResults.slice(0, limit);
    }

    if (searchResults.length === 0) {
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
      const scrapePromises = searchResults.map((result) =>
        scrapeSearchResultWithWallet(
          result,
          {
            teamId: req.auth.team_id,
            origin: req.body.origin,
            timeout: req.body.timeout,
            scrapeOptions: req.body.scrapeOptions,
          },
          req.acuc?.flags ?? null,
          (req.acuc?.price_credits ?? 0) <= 3000,
          isSearchPreview,
        ),
      );

      const docsWithCostTracking = await Promise.all(scrapePromises);

      const docs = docsWithCostTracking.map(item => item.document);
      const filteredDocs = docs.filter(
        (doc) =>
          doc.serpResults || (doc.markdown && doc.markdown.trim().length > 0),
      );

      if (filteredDocs.length === 0) {
        responseData.data = docs;
        responseData.warning = "No content found in search results";
      } else {
        responseData.data = filteredDocs;
      }
    }

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

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
} 