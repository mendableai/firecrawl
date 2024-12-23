import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  MapDocument,
  mapRequestSchema,
  RequestWithAuth,
  scrapeOptions,
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

configDotenv();
const redis = new Redis(process.env.REDIS_URL!);

// Max Links that /map can return
const MAX_MAP_LIMIT = 5000;
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
  plan,
  origin,
  includeMetadata = false,
  allowExternalLinks,
}: {
  url: string;
  search?: string;
  limit?: number;
  ignoreSitemap?: boolean;
  includeSubdomains?: boolean;
  crawlerOptions?: any;
  teamId: string;
  plan?: string;
  origin?: string;
  includeMetadata?: boolean;
  allowExternalLinks?: boolean;
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
    internalOptions: {},
    team_id: teamId,
    createdAt: Date.now(),
    plan: plan,
  };

  const crawler = crawlToCrawler(id, sc);

  // If sitemapOnly is true, only get links from sitemap
  if (crawlerOptions.sitemapOnly) {
    const sitemap = await crawler.tryGetSitemap(true, true);
    if (sitemap !== null) {
      sitemap.forEach((x) => {
        links.push(x.url);
      });
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
        });
      };

      pagePromises = Array.from({ length: maxPages }, (_, i) =>
        fetchPage(i + 1),
      );
      allResults = await Promise.all(pagePromises);

      await redis.set(cacheKey, JSON.stringify(allResults), "EX", 24 * 60 * 60); // Cache for 24 hours
    }

    // Parallelize sitemap fetch with serper search
    const [sitemap, ...searchResults] = await Promise.all([
      ignoreSitemap ? null : crawler.tryGetSitemap(true),
      ...(cachedResult ? [] : pagePromises),
    ]);

    if (!cachedResult) {
      allResults = searchResults;
    }

    if (sitemap !== null) {
      sitemap.forEach((x) => {
        links.push(x.url);
      });
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

    // remove duplicates that could be due to http/https or www
    links = removeDuplicateUrls(links);
  }

  const linksToReturn = crawlerOptions.sitemapOnly
    ? links
    : links.slice(0, limit);

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

  const result = await getMapResults({
    url: req.body.url,
    search: req.body.search,
    limit: req.body.limit,
    ignoreSitemap: req.body.ignoreSitemap,
    includeSubdomains: req.body.includeSubdomains,
    crawlerOptions: req.body,
    origin: req.body.origin,
    teamId: req.auth.team_id,
    plan: req.auth.plan,
  });

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
