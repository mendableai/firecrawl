import express from "express";
import { crawlController } from "../../src/controllers/v1/crawl";
// import { crawlStatusController } from "../../src/controllers/v1/crawl-status";
import { scrapeController } from "../../src/controllers/v1/scrape";
import { crawlStatusController } from "../../src/controllers/v1/crawl-status";
import { mapController } from "../../src/controllers/v1/map";
// import { crawlPreviewController } from "../../src/controllers/v1/crawlPreview";
// import { crawlJobStatusPreviewController } from "../../src/controllers/v1/status";
// import { searchController } from "../../src/controllers/v1/search";
// import { crawlCancelController } from "../../src/controllers/v1/crawl-cancel";
// import { keyAuthController } from "../../src/controllers/v1/keyAuth";
// import { livenessController } from "../controllers/v1/liveness";
// import { readinessController } from "../controllers/v1/readiness";

export const v1Router = express.Router();

v1Router.post("/v1/scrape", scrapeController);
v1Router.post("/v1/crawl", crawlController);
v1Router.get("/v1/crawl/:jobId", crawlStatusController);
// v1Router.post("/v1/crawlWebsitePreview", crawlPreviewController);
// v1Router.delete("/v1/crawl/cancel/:jobId", crawlCancelController);
// v1Router.get("/v1/checkJobStatus/:jobId", crawlJobStatusPreviewController);

// // Auth route for key based authentication
// v1Router.get("/v1/keyAuth", keyAuthController);

// // Search routes
// v0Router.post("/v1/search", searchController);

// Health/Probe routes
// v1Router.get("/v1/health/liveness", livenessController);
// v1Router.get("/v1/health/readiness", readinessController);

v1Router.post("/v1/map", mapController);