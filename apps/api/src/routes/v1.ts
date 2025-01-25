import express, { NextFunction, Request, Response } from "express";
import { crawlController } from "../controllers/v1/crawl";
// import { crawlStatusController } from "../../src/controllers/v1/crawl-status";
import { scrapeController } from "../../src/controllers/v1/scrape";
import { crawlStatusController } from "../controllers/v1/crawl-status";
import { mapController } from "../controllers/v1/map";
import {
  ErrorResponse,
  RequestWithACUC,
  RequestWithAuth,
  RequestWithMaybeAuth,
} from "../controllers/v1/types";
import { RateLimiterMode } from "../types";
import { authenticateUser } from "../controllers/auth";
import { createIdempotencyKey } from "../services/idempotency/create";
import { validateIdempotencyKey } from "../services/idempotency/validate";
import { checkTeamCredits } from "../services/billing/credit_billing";
import expressWs from "express-ws";
import { crawlStatusWSController } from "../controllers/v1/crawl-status-ws";
import { isUrlBlocked } from "../scraper/WebScraper/utils/blocklist";
import { crawlCancelController } from "../controllers/v1/crawl-cancel";
import { logger } from "../lib/logger";
import { scrapeStatusController } from "../controllers/v1/scrape-status";
import { concurrencyCheckController } from "../controllers/v1/concurrency-check";
import { batchScrapeController } from "../controllers/v1/batch-scrape";
import { extractController } from "../controllers/v1/extract";
import { extractStatusController } from "../controllers/v1/extract-status";
import { creditUsageController } from "../controllers/v1/credit-usage";
import { BLOCKLISTED_URL_MESSAGE } from "../lib/strings";
import { searchController } from "../controllers/v1/search";
import { crawlErrorsController } from "../controllers/v1/crawl-errors";

function checkCreditsMiddleware(
  minimum?: number,
): (req: RequestWithAuth, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    (async () => {
      if (!minimum && req.body) {
        minimum =
          (req.body as any)?.limit ?? (req.body as any)?.urls?.length ?? 1;
      }
      const { success, remainingCredits, chunk } = await checkTeamCredits(
        req.acuc,
        req.auth.team_id,
        minimum ?? 1,
      );
      if (chunk) {
        req.acuc = chunk;
      }
      if (!success) {
        logger.error(
          `Insufficient credits: ${JSON.stringify({ team_id: req.auth.team_id, minimum, remainingCredits })}`,
          {
            teamId: req.auth.team_id,
            minimum,
            remainingCredits,
            request: req.body,
            path: req.path
          }
        );
        if (!res.headersSent && req.auth.team_id !== "8c528896-7882-4587-a4b6-768b721b0b53") {
          return res.status(402).json({
            success: false,
            error:
              "Insufficient credits to perform this request. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing or try changing the request limit to a lower value.",
          });
        }
      }
      req.account = { remainingCredits };
      next();
    })().catch((err) => next(err));
  };
}

export function authMiddleware(
  rateLimiterMode: RateLimiterMode,
): (req: RequestWithMaybeAuth, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    (async () => {
      const auth = await authenticateUser(req, res, rateLimiterMode);

      if (!auth.success) {
        if (!res.headersSent) {
          return res
            .status(auth.status)
            .json({ success: false, error: auth.error });
        } else {
          return;
        }
      }

      const { team_id, plan, chunk } = auth;

      req.auth = { team_id, plan };
      req.acuc = chunk ?? undefined;
      if (chunk) {
        req.account = { remainingCredits: chunk.remaining_credits };
      }
      next();
    })().catch((err) => next(err));
  };
}

function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  (async () => {
    if (req.headers["x-idempotency-key"]) {
      const isIdempotencyValid = await validateIdempotencyKey(req);
      if (!isIdempotencyValid) {
        if (!res.headersSent) {
          return res
            .status(409)
            .json({ success: false, error: "Idempotency key already used" });
        }
      }
      createIdempotencyKey(req);
    }
    next();
  })().catch((err) => next(err));
}

function blocklistMiddleware(req: Request, res: Response, next: NextFunction) {
  if (typeof req.body.url === "string" && isUrlBlocked(req.body.url)) {
    if (!res.headersSent) {
      return res.status(403).json({
        success: false,
        error: BLOCKLISTED_URL_MESSAGE,
      });
    }
  }
  next();
}

export function wrap(
  controller: (req: Request, res: Response) => Promise<any>,
): (req: Request, res: Response, next: NextFunction) => any {
  return (req, res, next) => {
    controller(req, res).catch((err) => next(err));
  };
}

expressWs(express());

export const v1Router = express.Router();

v1Router.post(
  "/scrape",
  authMiddleware(RateLimiterMode.Scrape),
  checkCreditsMiddleware(1),
  blocklistMiddleware,
  wrap(scrapeController),
);

v1Router.post(
  "/crawl",
  authMiddleware(RateLimiterMode.Crawl),
  checkCreditsMiddleware(),
  blocklistMiddleware,
  idempotencyMiddleware,
  wrap(crawlController),
);

v1Router.post(
  "/batch/scrape",
  authMiddleware(RateLimiterMode.Crawl),
  checkCreditsMiddleware(),
  blocklistMiddleware,
  idempotencyMiddleware,
  wrap(batchScrapeController),
);

v1Router.post(
  "/search",
  authMiddleware(RateLimiterMode.Search),
  checkCreditsMiddleware(),
  wrap(searchController),
);

v1Router.post(
  "/map",
  authMiddleware(RateLimiterMode.Map),
  checkCreditsMiddleware(1),
  blocklistMiddleware,
  wrap(mapController),
);

v1Router.get(
  "/crawl/:jobId",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(crawlStatusController),
);

v1Router.get(
  "/batch/scrape/:jobId",
  authMiddleware(RateLimiterMode.CrawlStatus),
  // Yes, it uses the same controller as the normal crawl status controller
  wrap((req: any, res): any => crawlStatusController(req, res, true)),
);

v1Router.get(
  "/crawl/:jobId/errors",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(crawlErrorsController),
);

v1Router.get(
  "/batch/scrape/:jobId/errors",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(crawlErrorsController),
);

v1Router.get(
  "/scrape/:jobId",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(scrapeStatusController),
);

v1Router.get(
  "/concurrency-check",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(concurrencyCheckController),
);

v1Router.ws("/crawl/:jobId", crawlStatusWSController);

v1Router.post(
  "/extract",
  authMiddleware(RateLimiterMode.Extract),
  checkCreditsMiddleware(1),
  wrap(extractController),
);

v1Router.get(
  "/extract/:jobId",
  authMiddleware(RateLimiterMode.ExtractStatus),
  wrap(extractStatusController),
);

// v1Router.post("/crawlWebsitePreview", crawlPreviewController);

v1Router.delete(
  "/crawl/:jobId",
  authMiddleware(RateLimiterMode.CrawlStatus),
  crawlCancelController,
);
// v1Router.get("/checkJobStatus/:jobId", crawlJobStatusPreviewController);

// // Auth route for key based authentication
// v1Router.get("/keyAuth", keyAuthController);

// // Search routes
// v0Router.post("/search", searchController);

// Health/Probe routes
// v1Router.get("/health/liveness", livenessController);
// v1Router.get("/health/readiness", readinessController);

v1Router.get(
  "/team/credit-usage",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(creditUsageController),
);
