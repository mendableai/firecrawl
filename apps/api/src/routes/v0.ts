import express from "express";
import { crawlController } from "../../src/controllers/v0/crawl";
import { crawlStatusController } from "../../src/controllers/v0/crawl-status";
import { scrapeController } from "../../src/controllers/v0/scrape";
import { crawlPreviewController } from "../../src/controllers/v0/crawlPreview";
import { crawlJobStatusPreviewController } from "../../src/controllers/v0/status";
import { searchController } from "../../src/controllers/v0/search";
import { crawlCancelController } from "../../src/controllers/v0/crawl-cancel";
import { keyAuthController } from "../../src/controllers/v0/keyAuth";
import { livenessController } from "../controllers/v0/liveness";
import { readinessController } from "../controllers/v0/readiness";

export const v0Router = express.Router();

v0Router.post("/v0/scrape", scrapeController);
v0Router.post("/v0/crawl", crawlController);
v0Router.post("/v0/crawlWebsitePreview", crawlPreviewController);
v0Router.get("/v0/crawl/status/:jobId", crawlStatusController);
v0Router.delete("/v0/crawl/cancel/:jobId", crawlCancelController);
v0Router.get("/v0/checkJobStatus/:jobId", crawlJobStatusPreviewController);

// Auth route for key based authentication
v0Router.get("/v0/keyAuth", keyAuthController);

// Search routes
v0Router.post("/v0/search", searchController);

// Health/Probe routes
v0Router.get("/v0/health/liveness", livenessController);
v0Router.get("/v0/health/readiness", readinessController);
