import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  mapRequestSchema,
  RequestWithAuth,
  scrapeOptions,
  TeamFlags,
  TimeoutSignal,
  MapRequest,
  MapDocument,
  MapResponse,
} from "./types";
import { crawlToCrawler, StoredCrawl } from "../../lib/crawl-redis";
import { configDotenv } from "dotenv";
import {
  checkAndUpdateURLForMap,
  isSameDomain,
  isSameSubdomain,
} from "../../lib/validateUrl";
import { fireEngineMap } from "../../search/fireEngine";
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";
import { logger } from "../../lib/logger";
import Redis from "ioredis";
import { generateURLSplits, queryIndexAtDomainSplitLevelWithMeta, queryIndexAtSplitLevelWithMeta } from "../../services/index";

configDotenv();
const redis = new Redis(process.env.REDIS_URL!);

// Max Links that /map can return
const MAX_MAP_LIMIT = 30000;
// Max Links that "Smart /map" can return
const MAX_FIRE_ENGINE_RESULTS = 500;

interface MapResult {
  success: boolean;
  job_id: string;
  time_taken: number;
  mapResults: MapDocument[];
}

async function queryIndex(url: string, limit: number, useIndex: boolean): Promise<MapDocument[]> {
  if (!useIndex) {
    return [];
  }

  const urlSplits = generateURLSplits(url);
  if (urlSplits.length === 1) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    return (await queryIndexAtDomainSplitLevelWithMeta(hostname, limit));
  } else {
    return (await queryIndexAtSplitLevelWithMeta(url, limit));
  }
}

export async function getMapResults({
  url,
  search,
  limit = MAX_MAP_LIMIT,
  includeSubdomains = true,
  crawlerOptions = {},
  teamId,
  allowExternalLinks,
  abort = new AbortController().signal, // noop
  filterByPath = true,
  flags,
  useIndex = true,
}: {
  url: string;
  search?: string;
  limit?: number;
  ignoreSitemap?: boolean;
  includeSubdomains?: boolean;
  crawlerOptions?: any;
  teamId: string;
  origin?: string;
  includeMetadata?: boolean;
  allowExternalLinks?: boolean;
  abort?: AbortSignal;
  mock?: string;
  filterByPath?: boolean;
  flags: TeamFlags;
  useIndex?: boolean;
}): Promise<MapResult> {
  const id = uuidv4();
  let mapResults: MapDocument[] = [];

  const sc: StoredCrawl = {
    originUrl: url,
    crawlerOptions: {
      ...crawlerOptions,
      limit: crawlerOptions.sitemapOnly ? 10000000 : limit,
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

    await redis.set(cacheKey, JSON.stringify(allResults), "EX", 48 * 60 * 60); // Cache for 48 hours
  }

  // Parallelize sitemap index query with search results
  const [indexResults, ...searchResults] = await Promise.all([
    queryIndex(url, limit, useIndex),
    ...(cachedResult ? [] : pagePromises),
  ]);

  if (indexResults.length > 0) {
    mapResults.push(...indexResults);
  }

  console.log("searchResults", searchResults);

  mapResults = mapResults.concat(searchResults.map(x => ({
    url: x.url,
    title: x.title,
    description: x.description,
  })).flat());

  const minumumCutoff = Math.min(MAX_MAP_LIMIT, limit);
  if (mapResults.length > minumumCutoff) {
    mapResults = mapResults.slice(0, minumumCutoff);
  }

  mapResults = mapResults
    .map((x) => {
      try {
        return {
          ...x,
          url: checkAndUpdateURLForMap(x.url).url.trim(),
        };
      } catch (_) {
        return null;
      }
    })
    .filter((x) => x !== null) as MapDocument[];

  // allows for subdomains to be included
  mapResults = mapResults.filter((x) => isSameDomain(x.url, url));

  // if includeSubdomains is false, filter out subdomains
  if (!includeSubdomains) {
    mapResults = mapResults.filter((x) => isSameSubdomain(x.url, url));
  }

  // Filter by path if enabled
  if (filterByPath && !allowExternalLinks) {
    try {
      const urlObj = new URL(url);
      const urlPath = urlObj.pathname;
      // Only apply path filtering if the URL has a significant path (not just '/' or empty)
      // This means we only filter by path if the user has not selected a root domain
      if (urlPath && urlPath !== '/' && urlPath.length > 1) {
        mapResults = mapResults.filter(x => {
          try {
            const linkObj = new URL(x.url);
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

  return {
    success: true,
    mapResults: mapResults,
    job_id: id,
    time_taken: (new Date().getTime() - Date.now()) / 1000,
  };
}

export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>,
) {
  const originalRequest = req.body;
  req.body = mapRequestSchema.parse(req.body);

  logger.info("Map request", {
    request: req.body,
    originalRequest,
    teamId: req.auth.team_id,
  });

  let result: Awaited<ReturnType<typeof getMapResults>>;
  const abort = new AbortController();
  try {
    result = await Promise.race([
      getMapResults({
        url: req.body.url,
        search: req.body.search,
        limit: req.body.limit,
        ignoreSitemap: req.body.ignoreSitemap,
        includeSubdomains: req.body.includeSubdomains,
        crawlerOptions: req.body,
        origin: req.body.origin,
        teamId: req.auth.team_id,
        abort: abort.signal,
        mock: req.body.useMock,
        filterByPath: req.body.filterByPath !== false,
        flags: req.acuc?.flags ?? null,
        useIndex: req.body.useIndex,
      }),
      ...(req.body.timeout !== undefined ? [
        new Promise((resolve, reject) => setTimeout(() => {
          abort.abort(new TimeoutSignal());
          reject(new TimeoutSignal());
        }, req.body.timeout))
      ] : []),
    ]) as any;
  } catch (error) {
    if (error instanceof TimeoutSignal || error === "timeout") {
      return res.status(408).json({
        success: false,
        error: "Request timed out",
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
    success: result.mapResults.length > 0,
    message: "Map completed",
    num_docs: result.mapResults.length,
    docs: result.mapResults,
    time_taken: result.time_taken,
    team_id: req.auth.team_id,
    mode: "map",
    url: req.body.url,
    crawlerOptions: {},
    scrapeOptions: {},
    origin: req.body.origin ?? "api",
    integration: req.body.integration,
    num_tokens: 0,
    credits_billed: 1,
    zeroDataRetention: false, // not supported
  });

  const response = {
    success: true as const,
    links: result.mapResults,
  };

  return res.status(200).json(response);
}