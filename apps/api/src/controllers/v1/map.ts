import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  MapDocument,
  mapRequestSchema,
  RequestWithAuth,
  scrapeOptions,
  TeamFlags,
  TimeoutSignal,
} from "./types";
import { crawlToCrawler, StoredCrawl } from "../../lib/crawl-redis";
import { MapResponse, MapRequest } from "./types";
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
import { querySitemapIndex } from "../../scraper/WebScraper/sitemap-index";
import { getIndexQueue } from "../../services/queue-service";

configDotenv();
const redis = new Redis(process.env.REDIS_URL!);

// Max Links that /map can return
const MAX_MAP_LIMIT = 30000;
// Max Links that "Smart /map" can return
const MAX_FIRE_ENGINE_RESULTS = 500;

interface MapResult {
  success: boolean;
  links: string[];
  scrape_id?: string;
  job_id: string;
  time_taken: number;
  mapResults: MapDocument[];
}

export async function getMapResults({
  url,
  search,
  limit = MAX_MAP_LIMIT,
  ignoreSitemap = false,
  includeSubdomains = true,
  crawlerOptions = {},
  teamId,
  origin,
  includeMetadata = false,
  allowExternalLinks,
  abort = new AbortController().signal, // noop
  mock,
  filterByPath = true,
  flags,
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
}): Promise<MapResult> {
  const id = uuidv4();
  let links: string[] = [url];
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

  // If sitemapOnly is true, only get links from sitemap
  if (crawlerOptions.sitemapOnly) {
    const sitemap = await crawler.tryGetSitemap(
      (urls) => {
        urls.forEach((x) => {
          links.push(x);
        });
      },
      true,
      true,
      30000,
      abort,
      mock,
    );
    if (sitemap > 0) {
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
      // links = links.slice(1, limit); // don't slice, unnecessary
    }
  } else {
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
    const [sitemapIndexResult, ...searchResults] = await Promise.all([
      querySitemapIndex(url, abort),
      ...(cachedResult ? [] : pagePromises),
    ]);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // If sitemap is not ignored and either we have few URLs (<100) or the data is stale (>2 days old), fetch fresh sitemap
    if (
      !ignoreSitemap &&
      (sitemapIndexResult.urls.length < 100 ||
        new Date(sitemapIndexResult.lastUpdated) < twoDaysAgo)
    ) {
      try {
        await crawler.tryGetSitemap(
          (urls) => {
            links.push(...urls);
          },
          true,
          false,
          30000,
          abort,
        );
      } catch (e) {
        logger.warn("tryGetSitemap threw an error", { error: e });
      }
    }

    if (!cachedResult) {
      allResults = searchResults;
    }

    mapResults = allResults
      .flat()
      .filter((result) => result !== null && result !== undefined);

    const minumumCutoff = Math.min(MAX_MAP_LIMIT, limit);
    if (mapResults.length > minumumCutoff) {
      mapResults = mapResults.slice(0, minumumCutoff);
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

    // Add sitemap-index URLs
    links.push(...sitemapIndexResult.urls);

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

  const linksToReturn = crawlerOptions.sitemapOnly
    ? links
    : links.slice(0, limit);

  //

  await getIndexQueue().add(
    id,
    {
      originUrl: url,
      visitedUrls: linksToReturn,
    },
    {
      priority: 10,
    },
  );

  return {
    success: true,
    links: linksToReturn,
    mapResults: mapResults,
    scrape_id: origin?.includes("website") ? id : undefined,
    job_id: id,
    time_taken: (new Date().getTime() - Date.now()) / 1000,
  };
}

export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>,
) {
  req.body = mapRequestSchema.parse(req.body);

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
        flags: req.acuc.flags ?? null,
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
    success: result.links.length > 0,
    message: "Map completed",
    num_docs: result.links.length,
    docs: result.links,
    time_taken: result.time_taken,
    team_id: req.auth.team_id,
    mode: "map",
    url: req.body.url,
    crawlerOptions: {},
    scrapeOptions: {},
    origin: req.body.origin ?? "api",
    num_tokens: 0,
  });

  const response = {
    success: true as const,
    links: result.links,
    scrape_id: result.scrape_id,
  };

  return res.status(200).json(response);
}
