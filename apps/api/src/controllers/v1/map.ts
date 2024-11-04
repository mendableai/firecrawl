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

configDotenv();

export async function mapController(
  req: RequestWithAuth<{}, MapResponse, MapRequest>,
  res: Response<MapResponse>
) {
  const startTime = new Date().getTime();

  req.body = mapRequestSchema.parse(req.body);

  const limit: number = req.body.limit ?? 5000;

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

  const sitemap =
    req.body.ignoreSitemap ?? true ? null : await crawler.tryGetSitemap();

  if (sitemap !== null) {
    sitemap.map((x) => {
      links.push(x.url);
    });
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

  links = links.filter((x) => isSameDomain(x, req.body.url));

  if (!req.body.includeSubdomains) {
    links = links.filter((x) => isSameSubdomain(x, req.body.url));
  }

  links = removeDuplicateUrls(links);

  const endTime = new Date().getTime();

  const linksToReturn = links.slice(0, limit);

  return res.status(200).json({
    success: true,
    links: linksToReturn,
    scrape_id: req.body.origin?.includes("website") ? id : undefined,
  });
}
