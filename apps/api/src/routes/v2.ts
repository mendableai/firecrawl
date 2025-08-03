import express from "express";
import { RateLimiterMode } from "../types";
import expressWs from "express-ws";
import { searchController } from "../controllers/v2/search";
import { scrapeController } from "../controllers/v2/scrape";
import { batchScrapeController } from "../controllers/v2/batch-scrape";
import { crawlController } from "../controllers/v2/crawl";
import { crawlParamsPreviewController } from "../controllers/v2/crawl-params-preview";
import { crawlStatusController } from "../controllers/v2/crawl-status";
import { mapV2Controller } from "../controllers/v2/map";
import { crawlErrorsController } from "../controllers/v2/crawl-errors";
import {
  authMiddleware,
  checkCreditsMiddleware,
  blocklistMiddleware,
  idempotencyMiddleware,
  wrap,
} from "./shared";

expressWs(express());

export const v2Router = express.Router();

v2Router.post(
  "/search",
  authMiddleware(RateLimiterMode.Search),
  checkCreditsMiddleware(),
  wrap(searchController),
);

v2Router.post(
  "/scrape",
  authMiddleware(RateLimiterMode.Scrape),
  checkCreditsMiddleware(),
  wrap(scrapeController),
);

v2Router.post(
  "/batch/scrape",
  authMiddleware(RateLimiterMode.Scrape),
  checkCreditsMiddleware(),
  wrap(batchScrapeController),
);

v2Router.post(
  "/map",
  authMiddleware(RateLimiterMode.Map),
  checkCreditsMiddleware(),
  wrap(mapV2Controller),
);

v2Router.post(
  "/crawl",
  authMiddleware(RateLimiterMode.Crawl),
  checkCreditsMiddleware(),
  blocklistMiddleware,
  idempotencyMiddleware,
  wrap(crawlController),
);

v2Router.post(
  "/crawl/params-preview",
  authMiddleware(RateLimiterMode.Crawl),
  checkCreditsMiddleware(),
  wrap(crawlParamsPreviewController),
);

v2Router.get(
  "/crawl/:jobId",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(crawlStatusController),
);

v2Router.get(
  "/batch/scrape/:jobId",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap((req: any, res: any) => crawlStatusController(req, res, true)),
);

v2Router.get(
  "/crawl/:jobId/errors",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(crawlErrorsController),
);
