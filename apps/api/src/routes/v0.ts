import express from "express";
import { crawlController } from "../../src/controllers/crawl";
import { crawlStatusController } from "../../src/controllers/crawl-status";
import { scrapeController } from "../../src/controllers/scrape";
import { crawlPreviewController } from "../../src/controllers/crawlPreview";
import { crawlJobStatusPreviewController } from "../../src/controllers/status";
import { searchController } from "../../src/controllers/search";

export const v0Router = express.Router();

v0Router.post("/v0/scrape", scrapeController);
v0Router.post("/v0/crawl", crawlController);
v0Router.post("/v0/crawlWebsitePreview", crawlPreviewController);
v0Router.get("/v0/crawl/status/:jobId", crawlStatusController);
v0Router.get("/v0/checkJobStatus/:jobId", crawlJobStatusPreviewController);

// Search routes
v0Router.post("/v0/search", searchController);

