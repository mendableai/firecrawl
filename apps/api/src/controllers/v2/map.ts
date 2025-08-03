import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  RequestWithAuth,
  TeamFlags,
  TimeoutSignal,
  scrapeOptions,
  mapRequestSchema,
  MapRequest,
  MapV2Response,
  MapDocument,
} from "./types";
import { crawlToCrawler, StoredCrawl } from "../../lib/crawl-redis";
import { configDotenv } from "dotenv";
import {
  checkAndUpdateURLForMap,
  isSameDomain,
  isSameSubdomain,
  removeDuplicateUrls,
} from "../../lib/validateUrl";
import { fireEngineMap } from "../../search/fireEngine";
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";
import { performCosineSimilarity } from "../../lib/map-cosine";
import { logger } from "../../lib/logger";
import Redis from "ioredis";
import { generateURLSplits, queryIndexAtDomainSplitLevel, queryIndexAtSplitLevel, queryIndexDocument } from "../../services/index";
import { WebSearchResult } from "../../lib/entities";

configDotenv();
const redis = new Redis(process.env.REDIS_URL!);

// Max Links that /map can return
const MAX_MAP_LIMIT = 30000;
// Max Links that "Smart /map" can return
const MAX_FIRE_ENGINE_RESULTS = 500;

// MapRequest and MapV2Response are imported from ./types

interface MapResult {
  success: boolean;
  links: string[];
  scrape_id?: string;
  job_id: string;
  time_taken: number;
  mapResults: WebSearchResult[];
}

async function queryIndex(url: string, limit: number, useIndex: boolean, includeSubdomains: boolean): Promise<string[]> {
  if (!useIndex) {
    return [];
  }

  const urlSplits = generateURLSplits(url);
  if (urlSplits.length === 1) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // TEMP: this should be altered on June 15th 2025 7AM PT - mogery
    const domainLinks = includeSubdomains ? await queryIndexAtDomainSplitLevel(hostname, limit, 14 * 24 * 60 * 60 * 1000) : [];
    const splitLinks = await queryIndexAtSplitLevel(url, limit, 14 * 24 * 60 * 60 * 1000);

    return Array.from(new Set([...domainLinks, ...splitLinks]));
  } else {
    return await queryIndexAtSplitLevel(url, limit);
  }
}

async function enrichUrlsWithMetadata(urls: string[], useIndex: boolean, teamId: string, flags: TeamFlags): Promise<WebSearchResult[]> {
  if (!useIndex || urls.length === 0) {
    return urls.map(url => ({
      url,
      title: "",
      description: "",
    }));
  }

  // Query metadata for all URLs in parallel
  const metadataPromises = urls.map(async (url) => {
    try {
      const indexDocument = await queryIndexDocument(url);
      if (indexDocument) {
        return {
          url,
          title: indexDocument.title || "",
          description: indexDocument.description || "",
          metadata: {
            title: indexDocument.title,
            description: indexDocument.description,
            language: indexDocument.language,
            keywords: indexDocument.keywords,
            robots: indexDocument.robots,
            ogTitle: indexDocument.ogTitle,
            ogDescription: indexDocument.ogDescription,
            ogUrl: indexDocument.ogUrl,
            ogImage: indexDocument.ogImage,
            ogLocale: indexDocument.ogLocale,
            ogSiteName: indexDocument.ogSiteName,
            createdAt: indexDocument.createdAt,
            lastScrapedAt: indexDocument.lastScrapedAt,
          }
        };
      }
    } catch (error) {
      logger.warn(`Failed to fetch metadata for URL: ${url}`, { error });
    }
    
    // Fallback if no metadata found
    return {
      url,
      title: "",
      description: "",
    };
  });

  return await Promise.all(metadataPromises);
}

export async function getMapV2Results({
  url,
  search,
  limit = MAX_MAP_LIMIT,
  sitemap = "include",
  includeSubdomains = true,
  teamId,
  origin,
  allowExternalLinks,
  abort = new AbortController().signal,
  mock,
  filterByPath = true,
  flags,
  useIndex = true,
  includeMetadata = true,
  timeout,
}: {
  url: string;
  search?: string;
  limit?: number;
  sitemap?: "only" | "include" | "skip";
  includeSubdomains?: boolean;
  teamId: string;
  origin?: string;
  allowExternalLinks?: boolean;
  abort?: AbortSignal;
  mock?: string;
  filterByPath?: boolean;
  flags: TeamFlags;
  useIndex?: boolean;
  includeMetadata?: boolean;
  timeout?: number;
}): Promise<MapResult> {
  const id = uuidv4();
  let links: string[] = [url];
  let mapResults: WebSearchResult[] = [];

  const zeroDataRetention = flags?.forceZDR ?? false;

  const sc: StoredCrawl = {
    originUrl: url,
    crawlerOptions: {
      limit: sitemap === "only" ? 10000000 : limit,
      scrapeOptions: undefined,
    },
    scrapeOptions: scrapeOptions.parse({}),
    internalOptions: { teamId },
    team_id: teamId,
    createdAt: Date.now(),
  };

  const crawler = crawlToCrawler(id, sc, flags);

  try {
    sc.robots = await crawler.getRobotsTxt(false, abort);
    crawler.importRobotsTxt(sc.robots);
  } catch (_) {}

  // If sitemap is "only", only get links from sitemap
  if (sitemap === "only") {
    const sitemapCount = await crawler.tryGetSitemap(
      (urls) => {
        urls.forEach((x) => {
          links.push(x);
        });
      },
      true,
      true,
      timeout ?? 30000,
      abort,
      mock,
    );
    if (sitemapCount > 0) {
      links = links
        .slice(1)
        .map((x) => {
          try {
            return checkAndUpdateURLForMap(x).url.trim();
          } catch (_) {
            return null;
          }
        })
        .filter((x) => x !== null) as string[];
    }
  } else if (sitemap !== "skip") {
    // sitemap is "include" - fetch both search results and sitemap
    let urlWithoutWww = url.replace("www.", "");

    let mapUrl =
      search && allowExternalLinks
        ? `${search} ${urlWithoutWww}`
        : search
          ? `${search} site:${urlWithoutWww}`
          : `site:${url}`;

    const resultsPerPage = 100;
    const maxPages = Math.ceil(
      Math.min(MAX_FIRE_ENGINE_RESULTS, limit) / resultsPerPage,
    );

    const cacheKey = `fireEngineMap:${mapUrl}`;
    const cachedResult = await redis.get(cacheKey);

    let allResults: any[] = [];
    let pagePromises: Promise<any>[] = [];

    if (cachedResult) {
      allResults = JSON.parse(cachedResult);
    } else {
      const fetchPage = async (page: number) => {
        return fireEngineMap(mapUrl, {
          numResults: resultsPerPage,
          page: page,
        }, abort);
      };

      pagePromises = Array.from({ length: maxPages }, (_, i) =>
        fetchPage(i + 1),
      );
      allResults = await Promise.all(pagePromises);

      if (!zeroDataRetention) {
        await redis.set(cacheKey, JSON.stringify(allResults), "EX", 48 * 60 * 60); // Cache for 48 hours
      }
    }

    // Parallelize sitemap index query with search results
    const [indexResults, ...searchResults] = await Promise.all([
      queryIndex(url, limit, useIndex, includeSubdomains),
      ...(cachedResult ? [] : pagePromises),
    ]);

    if (indexResults.length > 0) {
      links.push(...indexResults);
    }

    // Fetch sitemap if sitemap is "include"
    try {
      await crawler.tryGetSitemap(
        (urls) => {
          links.push(...urls);
        },
        true,
        false,
        timeout ?? 30000,
        abort,
      );
    } catch (e) {
      logger.warn("tryGetSitemap threw an error", { error: e });
    }

    if (!cachedResult) {
      allResults = searchResults;
    }

    // Convert map results to WebSearchResult format
    const fireEngineResults = allResults
      .flat()
      .filter((result) => result !== null && result !== undefined)
      .map((result) => ({
        url: result.url,
        title: result.title || "",
        description: result.description || "",
      }));

    const minumumCutoff = Math.min(MAX_MAP_LIMIT, limit);
    if (fireEngineResults.length > minumumCutoff) {
      mapResults = fireEngineResults.slice(0, minumumCutoff);
    } else {
      mapResults = fireEngineResults;
    }

    if (mapResults.length > 0) {
      if (search) {
        // Ensure all map results are first, maintaining their order
        links = [
          mapResults[0].url,
          ...mapResults.slice(1).map((x) => x.url),
          ...links,
        ];
      } else {
        mapResults.map((x) => {
          links.push(x.url);
        });
      }
    }

    // Perform cosine similarity between the search query and the list of links
    if (search) {
      const searchQuery = search.toLowerCase();
      links = performCosineSimilarity(links, searchQuery);
    }

    links = links
      .map((x) => {
        try {
          return checkAndUpdateURLForMap(x).url.trim();
        } catch (_) {
          return null;
        }
      })
      .filter((x) => x !== null) as string[];

    // allows for subdomains to be included
    links = links.filter((x) => isSameDomain(x, url));

    // if includeSubdomains is false, filter out subdomains
    if (!includeSubdomains) {
      links = links.filter((x) => isSameSubdomain(x, url));
    }

    // Filter by path if enabled
    if (filterByPath && !allowExternalLinks) {
      try {
        const urlObj = new URL(url);
        const urlPath = urlObj.pathname;
        // Only apply path filtering if the URL has a significant path (not just '/' or empty)
        // This means we only filter by path if the user has not selected a root domain
        if (urlPath && urlPath !== '/' && urlPath.length > 1) {
          links = links.filter(link => {
            try {
              const linkObj = new URL(link);
              return linkObj.pathname.startsWith(urlPath);
            } catch (e) {
              return false;
            }
          });
        }
      } catch (e) {
        // If URL parsing fails, continue without path filtering
        logger.warn(`Failed to parse URL for path filtering: ${url}`, { error: e });
      }
    }

    // remove duplicates that could be due to http/https or www
    links = removeDuplicateUrls(links);
  }

  const linksToReturn = sitemap === "only"
    ? links
    : links.slice(0, limit);

  // Enrich URLs with metadata if requested
  let enrichedResults: WebSearchResult[] = [];
  if (includeMetadata) {
    enrichedResults = await enrichUrlsWithMetadata(linksToReturn, useIndex, teamId, flags);
  } else {
    enrichedResults = linksToReturn.map(url => ({
      url,
      title: "",
      description: "",
    }));
  }

  return {
    success: true,
    links: linksToReturn,
    mapResults: enrichedResults,
    scrape_id: origin?.includes("website") ? id : undefined,
    job_id: id,
    time_taken: (new Date().getTime() - Date.now()) / 1000,
  };
}

export async function mapV2Controller(
  req: RequestWithAuth<{}, MapV2Response, MapRequest>,
  res: Response<MapV2Response>,
) {
  const originalRequest = req.body;
  
  // Parse and validate the request using the v2 schema
  const parsedRequest = mapRequestSchema.parse(req.body);
  
  // Transform ignoreSitemap and sitemapOnly to the new unified sitemap parameter
  let sitemap: "only" | "include" | "skip" = "include";
  if (parsedRequest.sitemapOnly) {
    sitemap = "only";
  } else if (parsedRequest.ignoreSitemap) {
    sitemap = "skip";
  }
  
  if (req.acuc?.flags?.forceZDR) {
    return res.status(400).json({ 
      success: false, 
      error: "Your team has zero data retention enabled. This is not supported on map. Please contact support@firecrawl.com to unblock this feature.",
      code: "FORBIDDEN_ERROR" 
    });
  }

  logger.info("Map V2 request", {
    request: parsedRequest,
    originalRequest,
    teamId: req.auth.team_id,
  });

  let result: Awaited<ReturnType<typeof getMapV2Results>>;
  const abort = new AbortController();
  try {
    result = await Promise.race([
      getMapV2Results({
        url: parsedRequest.url,
        search: parsedRequest.search,
        limit: parsedRequest.limit,
        sitemap,
        includeSubdomains: parsedRequest.includeSubdomains,
        origin: parsedRequest.origin,
        teamId: req.auth.team_id,
        abort: abort.signal,
        mock: parsedRequest.useMock,
        filterByPath: parsedRequest.filterByPath,
        flags: req.acuc?.flags ?? null,
        useIndex: parsedRequest.useIndex,
        includeMetadata: true, // Always include metadata in v2
        timeout: parsedRequest.timeout,
      }),
      ...(parsedRequest.timeout !== undefined ? [
        new Promise((resolve, reject) => setTimeout(() => {
          abort.abort(new TimeoutSignal());
          reject(new TimeoutSignal());
        }, parsedRequest.timeout!))
      ] : []),
    ]) as any;
  } catch (error) {
    if (error instanceof TimeoutSignal || error === "timeout") {
      return res.status(408).json({
        success: false,
        error: "Request timed out",
        code: "TIMEOUT_ERROR",
      });
    } else {
      throw error;
    }
  }

  // Bill the team
  billTeam(req.auth.team_id, req.acuc?.sub_id, 1).catch((error) => {
    logger.error(
      `Failed to bill team ${req.auth.team_id} for 1 credit: ${error}`,
    );
  });

  // Log the job
  logJob({
    job_id: result.job_id,
    success: result.links.length > 0,
    message: "Map V2 completed",
    num_docs: result.links.length,
    docs: result.links,
    time_taken: result.time_taken,
    team_id: req.auth.team_id,
    mode: "map",
    url: parsedRequest.url,
    crawlerOptions: {},
    scrapeOptions: {},
    origin: parsedRequest.origin ?? "api",
    integration: parsedRequest.integration,
    num_tokens: 0,
    credits_billed: 1,
    zeroDataRetention: false, // not supported
  });

  const response: MapV2Response = {
    success: true as const,
    links: result.links, // For backwards compatibility
    web: result.mapResults,
    metadata: {
      totalCount: result.links.length,
      hasMore: result.links.length >= parsedRequest.limit,
      searchQuery: parsedRequest.search,
    },
  };

  return res.status(200).json(response);
} 