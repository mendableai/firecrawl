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
import { billTeam } from "../../services/billing/credit_billing";
import { logJob } from "../../services/logging/log_job";
import { performCosineSimilarity } from "../../lib/map-cosine";
import { Logger } from "../../lib/logger";
import Redis from "ioredis";

configDotenv();
const redis = new Redis(process.env.REDIS_URL);

// Max Links that /map can return
const MAX_MAP_LIMIT = 5000;
// Max Links that "Smart /map" can return
const MAX_FIRE_ENGINE_RESULTS = 1000;

export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>
) {
  const startTime = new Date().getTime();

  req.body = mapRequestSchema.parse(req.body);

  const limit: number = req.body.limit ?? MAX_MAP_LIMIT;

  const id = uuidv4();
  let links: string[] = [req.body.url];

  const sc: StoredCrawl = {
    originUrl: req.body.url,
    crawlerOptions: legacyCrawlerOptions(req.body),
    pageOptions: {},
    team_id: req.auth.team_id,
    createdAt: Date.now(),
    plan: req.auth.plan,
  };

  const crawler = crawlToCrawler(id, sc);

  let urlWithoutWww = req.body.url.replace("www.", "");

  let mapUrl = req.body.search
    ? `"${req.body.search}" site:${urlWithoutWww}`
    : `site:${req.body.url}`;

  const resultsPerPage = 100;
  const maxPages = Math.ceil(Math.min(MAX_FIRE_ENGINE_RESULTS, limit) / resultsPerPage);

  const cacheKey = `fireEngineMap:${mapUrl}`;
  const cachedResult = await redis.get(cacheKey);

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

    await redis.set(cacheKey, JSON.stringify(allResults), "EX", 24 * 60 * 60); // Cache for 24 hours
  }

  // Parallelize sitemap fetch with serper search
  const [sitemap, ...searchResults] = await Promise.all([
    req.body.ignoreSitemap ? null : crawler.tryGetSitemap(),
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

  let mapResults = allResults
    .flat()
    .filter((result) => result !== null && result !== undefined);

  const minumumCutoff = Math.min(MAX_MAP_LIMIT, limit);
  if (mapResults.length > minumumCutoff) {
    mapResults = mapResults.slice(0, minumumCutoff);
  }

  if (mapResults.length > 0) {
    if (req.body.search) {
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
  if (req.body.search) {
    const searchQuery = req.body.search.toLowerCase();

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
    .filter((x) => x !== null);

  // allows for subdomains to be included
  links = links.filter((x) => isSameDomain(x, req.body.url));

  // if includeSubdomains is false, filter out subdomains
  if (!req.body.includeSubdomains) {
    links = links.filter((x) => isSameSubdomain(x, req.body.url));
  }

  // remove duplicates that could be due to http/https or www
  links = removeDuplicateUrls(links);

  billTeam(req.auth.team_id, 1).catch((error) => {
    Logger.error(
      `Failed to bill team ${req.auth.team_id} for 1 credit: ${error}`
    );
    // Optionally, you could notify an admin or add to a retry queue here
  });

  const endTime = new Date().getTime();
  const timeTakenInSeconds = (endTime - startTime) / 1000;

  const linksToReturn = links.slice(0, limit);

  logJob({
    job_id: id,
    success: links.length > 0,
    message: "Map completed",
    num_docs: linksToReturn.length,
    docs: linksToReturn,
    time_taken: timeTakenInSeconds,
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
    links: linksToReturn,
    scrape_id: req.body.origin?.includes("website") ? id : undefined,
  });
}

// Subdomain sitemap url checking

// // For each result, check for subdomains, get their sitemaps and add them to the links
// const processedUrls = new Set();
// const processedSubdomains = new Set();

// for (const result of links) {
//   let url;
//   let hostParts;
//   try {
//     url = new URL(result);
//     hostParts = url.hostname.split('.');
//   } catch (e) {
//     continue;
//   }

//   console.log("hostParts", hostParts);
//   // Check if it's a subdomain (more than 2 parts, and not 'www')
//   if (hostParts.length > 2 && hostParts[0] !== 'www') {
//     const subdomain = hostParts[0];
//     console.log("subdomain", subdomain);
//     const subdomainUrl = `${url.protocol}//${subdomain}.${hostParts.slice(-2).join('.')}`;
//     console.log("subdomainUrl", subdomainUrl);

//     if (!processedSubdomains.has(subdomainUrl)) {
//       processedSubdomains.add(subdomainUrl);

//       const subdomainCrawl = crawlToCrawler(id, {
//         originUrl: subdomainUrl,
//         crawlerOptions: legacyCrawlerOptions(req.body),
//         pageOptions: {},
//         team_id: req.auth.team_id,
//         createdAt: Date.now(),
//         plan: req.auth.plan,
//       });
//       const subdomainSitemap = await subdomainCrawl.tryGetSitemap();
//       if (subdomainSitemap) {
//         subdomainSitemap.forEach((x) => {
//           if (!processedUrls.has(x.url)) {
//             processedUrls.add(x.url);
//             links.push(x.url);
//           }
//         });
//       }
//     }
//   }
// }
