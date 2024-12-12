import express, { NextFunction, Request, Response } from "express";
import { RateLimiterMode } from "../types";
import { authenticateUser } from "../controllers/auth";
import { crawlController } from "../controllers/v1/crawl";
import { scrapeController } from "../../src/controllers/v1/scrape";
import { crawlStatusController } from "../controllers/v1/crawl-status";
import { mapController } from "../controllers/v1/map";
import { RequestWithMaybeAuth } from "../controllers/v1/types";
import { createIdempotencyKey } from "../services/idempotency/create";
import { crawlCancelController } from "../controllers/v1/crawl-cancel";
import { scrapeStatusController } from "../controllers/v1/scrape-status";
import { livenessController } from "../controllers/v1/liveness";
import { readinessController } from "../controllers/v1/readiness";
import expressWs from "express-ws";

export function authMiddleware(
  rateLimiterMode: RateLimiterMode
): (req: RequestWithMaybeAuth, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    (async () => {
      const { success, team_id, error, status, plan } = await authenticateUser(
        req,
        res,
        rateLimiterMode
      );

      if (!success) {
        if (!res.headersSent) {
          return res.status(status).json({ success: false, error });
        }
      }

      req.auth = { team_id, plan };
      next();
    })().catch((err) => next(err));
  };
}

function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  (async () => {
    if (req.headers["x-idempotency-key"]) {
      createIdempotencyKey(req);
    }
    next();
  })().catch((err) => next(err));
}

function wrap(
  controller: (req: Request, res: Response) => Promise<any>
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
  wrap(scrapeController)
);

v1Router.post(
  "/crawl",
  authMiddleware(RateLimiterMode.Crawl),
  idempotencyMiddleware,
  wrap(crawlController)
);

v1Router.post("/map", authMiddleware(RateLimiterMode.Map), wrap(mapController));

v1Router.get(
  "/crawl/:jobId",
  authMiddleware(RateLimiterMode.CrawlStatus),
  wrap(crawlStatusController)
);

v1Router.get("/scrape/:jobId", wrap(scrapeStatusController));

v1Router.delete(
  "/crawl/:jobId",
  authMiddleware(RateLimiterMode.Crawl),
  crawlCancelController
);

// Health/Probe routes
v1Router.get("/health/liveness", livenessController);
v1Router.get("/health/readiness", readinessController);
