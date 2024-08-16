import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { legacyCrawlerOptions, mapRequestSchema, RequestWithAuth } from "./types";
import { crawlToCrawler, StoredCrawl } from "../../lib/crawl-redis";
import { MapResponse , MapRequest } from "./types";
import { Logger } from "../../lib/logger";
import { configDotenv } from "dotenv";
import { search } from "../../search";
import { checkAndUpdateURL } from "../../lib/validateUrl";

configDotenv();

export async function mapController(req: RequestWithAuth<{}, MapResponse, MapRequest>, res: Response<MapResponse>) {
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

  const sitemap = sc.crawlerOptions.ignoreSitemap ? null : await crawler.tryGetSitemap();

  if (sitemap !== null) {
    sitemap.map(x => { links.push(x.url); });
  }

  const searchResults = await search({
    query: `site:${req.body.url}`,
    advanced: false,
    num_results: 50,
    lang: "en",
    country: "us",
    location: "United States",
  })

  if (searchResults.length > 0) {
    searchResults.map(x => { links.push(x.url); });
  }

  links = links.map(x => checkAndUpdateURL(x).url);
  links = [...new Set(links)];

  return res.status(200).json({
    success: true,
    links
  });
}
