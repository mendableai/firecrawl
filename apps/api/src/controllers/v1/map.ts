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
} from "../../lib/validateUrl";
import { fireEngineMap } from "../../search/fireEngine";

configDotenv();

export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>
) {
  req.body = mapRequestSchema.parse(req.body);

  const id = uuidv4();
  let links: string[] = [req.body.url];

  const crawlerOptions = legacyCrawlerOptions(req.body);

  const sc: StoredCrawl = {
    originUrl: req.body.url,
    crawlerOptions,
    pageOptions: {},
    team_id: req.auth.team_id,
    createdAt: Date.now(),
  };

  const crawler = crawlToCrawler(id, sc);

  const sitemap =
    sc.crawlerOptions.ignoreSitemap || req.body.search
      ? null
      : await crawler.tryGetSitemap();

  if (sitemap !== null) {
    sitemap.map((x) => {
      links.push(x.url);
    });
  }

  let mapUrl = req.body.search
    ? `"${req.body.search}" site:${req.body.url}`
    : `site:${req.body.url}`;
  // www. seems to exclude subdomains in some cases
  const mapResults = await fireEngineMap(mapUrl, {
    numResults: 50,
  });

  if (mapResults.length > 0) {
    mapResults.map((x) => {
      if (req.body.search) {
        links.unshift(x.url);
      } else {
        links.push(x.url);
      }
    });
  }

  links = links.map((x) => checkAndUpdateURLForMap(x).url);

  // allows for subdomains to be included
  links = links.filter((x) => isSameDomain(x, req.body.url));

  // if includeSubdomains is false, filter out subdomains
  if (!req.body.includeSubdomains) {
    links = links.filter((x) => isSameSubdomain(x, req.body.url));
  }

  // remove duplicates that could be due to http/https or www

  links = [...new Set(links)];

  return res.status(200).json({
    success: true,
    links,
  });
}
