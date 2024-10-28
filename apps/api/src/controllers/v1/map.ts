import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  legacyCrawlerOptions,
  mapRequestSchema,
  RequestWithAuth,
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
import { performCosineSimilarity } from "../../lib/map-cosine";
import { Logger } from "../../lib/logger";
import Redis from "ioredis";
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";

configDotenv();
const redis = new Redis(process.env.REDIS_URL);

// Max Links that /map can return
const MAX_MAP_LIMIT = 5000;
// Max Links that "Smart /map" can return
const MAX_FIRE_ENGINE_RESULTS = 1000;

interface MapOptions {
  url: string;
  search?: string;
  limit?: number;
  ignoreSitemap?: boolean;
  includeSubdomains?: boolean;
  crawlerOptions?: any;
  teamId: string;
  plan: string;
  origin?: string;
  subId?: string;
  includeMetadata?: boolean;
}

export async function getMapResults({
  url,
  search,
  limit = MAX_MAP_LIMIT,
  ignoreSitemap = false,
  includeSubdomains = false,
  crawlerOptions = {},
  teamId,
  plan,
  origin,
  subId,
  includeMetadata = false,
}: MapOptions) {
  const startTime = new Date().getTime();
  const id = uuidv4();
  let links: { url: string; title?: string; description?: string }[] = [{ url }];

  const sc: StoredCrawl = {
    originUrl: url,
    crawlerOptions,
    pageOptions: {},
    team_id: teamId,
    createdAt: Date.now(),
    plan,
  };

  const crawler = crawlToCrawler(id, sc);

  let urlWithoutWww = url.replace("www.", "");
  let mapUrl = search ? `"${search}" site:${urlWithoutWww}` : `site:${url}`;

  const resultsPerPage = 100;
  const maxPages = Math.ceil(Math.min(MAX_FIRE_ENGINE_RESULTS, limit) / resultsPerPage);

  const cacheKey = `fireEngineMap:${mapUrl}`;
  const cachedResult = null;

  let allResults: any[];
  let pagePromises: Promise<any>[];

  if (cachedResult) {
    allResults = JSON.parse(cachedResult);
  } else {
    const fetchPage = async (page: number) => {
      return fireEngineMap(mapUrl, {
        numResults: resultsPerPage,
        page: page,
      });
    };

    pagePromises = Array.from({ length: maxPages }, (_, i) => fetchPage(i + 1));
    allResults = await Promise.all(pagePromises);

    await redis.set(cacheKey, JSON.stringify(allResults), "EX", 24 * 60 * 60);
  }

  const [sitemap, ...searchResults] = await Promise.all([
    ignoreSitemap ? null : crawler.tryGetSitemap(),
    ...(cachedResult ? [] : pagePromises),
  ]);

  if (!cachedResult) {
    allResults = searchResults;
  }

  if (sitemap !== null) {
    sitemap.forEach((x) => {
      links.push({ url: x.url });
    });
  }

  let mapResults = allResults
    .flat()
    .filter((result) => result !== null && result !== undefined);

  const minumumCutoff = Math.min(MAX_MAP_LIMIT, limit);
  if (mapResults.length > minumumCutoff) {
    mapResults = mapResults.slice(0, minumumCutoff);
  }

  if (mapResults.length > 0) {
    if (search) {
      links = [
        { url: mapResults[0].url, title: mapResults[0].title, description: mapResults[0].description },
        ...mapResults.slice(1).map((x) => ({ 
          url: x.url,
          title: x.title,
          description: x.description
        })),
        ...links,
      ];
    } else {
      mapResults.forEach((x) => {
        links.push({ 
          url: x.url,
          title: x.title,
          description: x.description
        });
      });
    }
  }

  if (search) {
    const filteredLinks = performCosineSimilarity(links.map(l => l.url), search.toLowerCase());
    links = links.filter(l => filteredLinks.includes(l.url));
  }

  links = links
    .map((x) => {
      try {
        return { ...x, url: checkAndUpdateURLForMap(x.url).url.trim() };
      } catch (_) {
        return null;
      }
    })
    .filter((x) => x !== null);

  links = links.filter((x) => isSameDomain(x.url, url));

  if (!includeSubdomains) {
    links = links.filter((x) => isSameSubdomain(x.url, url));
  }

  links = removeDuplicateUrls(links.map(l => l.url)).map(url => links.find(l => l.url === url));

  const endTime = new Date().getTime();
  const timeTakenInSeconds = (endTime - startTime) / 1000;

  const linksToReturn = links.slice(0, limit);

  return {
    links: includeMetadata ? linksToReturn : linksToReturn.map(l => l.url),
    scrapeId: origin?.includes("website") ? id : undefined,
    timeTakenInSeconds,
    id,
    linksLength: links.length,
    linksToReturnLength: linksToReturn.length,
    docs: linksToReturn.map(l => l.url),
  };
}

export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>
) {
  req.body = mapRequestSchema.parse(req.body);

  const results = await getMapResults({
    url: req.body.url,
    search: req.body.search,
    limit: req.body.limit,
    ignoreSitemap: req.body.ignoreSitemap,
    includeSubdomains: req.body.includeSubdomains,
    crawlerOptions: legacyCrawlerOptions(req.body),
    teamId: req.auth.team_id,
    plan: req.auth.plan,
    origin: req.body.origin,
    subId: req.acuc?.sub_id,
  });

  await billTeam(req.auth.team_id, req.acuc?.sub_id, 1).catch((error) => {
    Logger.error(`Failed to bill team ${req.auth.team_id} for 1 credit: ${error}`);
  });

  await logJob({
    job_id: results.id,
    success: results.linksLength > 0,
    message: "Map completed",
    num_docs: results.linksToReturnLength,
    docs: results.docs,
    time_taken: results.timeTakenInSeconds,
    team_id: req.auth.team_id,
    mode: "map",
    url: req.body.url,
    crawlerOptions: {},
    pageOptions: {},
    origin: req.body.origin,
    extractor_options: { mode: "markdown" },
    num_tokens: 0,
  });

  return res.status(200).json({
    success: true,
    links: results.links.map(l => l.url),
    scrape_id: results.scrapeId,
  });
}
