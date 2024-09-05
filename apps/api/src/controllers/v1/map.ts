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

configDotenv();

export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>
) {
  const startTime = new Date().getTime();

  req.body = mapRequestSchema.parse(req.body);


  const limit : number = req.body.limit ?? 5000;

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

  const sitemap = req.body.ignoreSitemap ? null : await crawler.tryGetSitemap();

  if (sitemap !== null) {
    sitemap.map((x) => {
      links.push(x.url);
    });
  }

  let urlWithoutWww = req.body.url.replace("www.", "");

  let mapUrl = req.body.search
    ? `"${req.body.search}" site:${urlWithoutWww}`
    : `site:${req.body.url}`;
  // www. seems to exclude subdomains in some cases
  const mapResults = await fireEngineMap(mapUrl, {
    // limit to 100 results (beta)
    numResults: Math.min(limit, 100),
  });

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

  links = links.map((x) => checkAndUpdateURLForMap(x).url.trim());

  // allows for subdomains to be included
  links = links.filter((x) => isSameDomain(x, req.body.url));

  // if includeSubdomains is false, filter out subdomains
  if (!req.body.includeSubdomains) {
    links = links.filter((x) => isSameSubdomain(x, req.body.url));
  }

  // remove duplicates that could be due to http/https or www
  links = removeDuplicateUrls(links);

  billTeam(req.auth.team_id, 1).catch(error => {
    Logger.error(`Failed to bill team ${req.auth.team_id} for 1 credit: ${error}`);
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
