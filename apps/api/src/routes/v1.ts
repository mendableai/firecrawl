import express, { NextFunction, Request, Response } from "express";
import { crawlController } from "../../src/controllers/v1/crawl";
// import { crawlStatusController } from "../../src/controllers/v1/crawl-status";
import { scrapeController } from "../../src/controllers/v1/scrape";
import { crawlStatusController } from "../../src/controllers/v1/crawl-status";
import { mapController } from "../../src/controllers/v1/map";
import { ErrorResponse, RequestWithAuth, RequestWithMaybeAuth } from "../controllers/v1/types";
import { RateLimiterMode } from "../types";
import { authenticateUser } from "../controllers/v1/auth";
import { Logger } from "../lib/logger";
import { createIdempotencyKey } from "../services/idempotency/create";
import { validateIdempotencyKey } from "../services/idempotency/validate";
import { ZodError } from "zod";
import { checkTeamCredits } from "../services/billing/credit_billing";
import { v4 as uuidv4 } from "uuid";
// import { crawlPreviewController } from "../../src/controllers/v1/crawlPreview";
// import { crawlJobStatusPreviewController } from "../../src/controllers/v1/status";
// import { searchController } from "../../src/controllers/v1/search";
// import { crawlCancelController } from "../../src/controllers/v1/crawl-cancel";
// import { keyAuthController } from "../../src/controllers/v1/keyAuth";
// import { livenessController } from "../controllers/v1/liveness";
// import { readinessController } from "../controllers/v1/readiness";

function checkCreditsMiddleware(minimum: number): (req: RequestWithAuth, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        (async () => {
            if (!(await checkTeamCredits(req.auth.team_id, minimum)).success) {
                return res.status(402).json({ success: false, error: "Insufficient credits" });
            }
            next();
        })()
            .catch(err => next(err));
    };
}

function authMiddleware(rateLimiterMode: RateLimiterMode): (req: RequestWithMaybeAuth, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        (async () => {
            const { success, team_id, error, status, plan } = await authenticateUser(
                req,
                res,
                rateLimiterMode,
            );

            if (!success) {
                return res.status(status).json({ success: false, error });
            }

            req.auth = { team_id, plan };
            next();
        })()
            .catch(err => next(err));
    }
}

function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
    (async () => {
        if (req.headers["x-idempotency-key"]) {
            const isIdempotencyValid = await validateIdempotencyKey(req);
            if (!isIdempotencyValid) {
                return res.status(409).json({ success: false, error: "Idempotency key already used" });
            }
            createIdempotencyKey(req);
        }
        next();
    })()
        .catch(err => next(err));
}

function wrap(controller: (req: Request, res: Response) => Promise<any>): (req: Request, res: Response, next: NextFunction) => any {
    return (req, res, next) => {
        controller(req, res)
            .catch(err => next(err))
    }
}

export const v1Router = express.Router();

v1Router.post(
    "/v1/scrape",
    authMiddleware(RateLimiterMode.Scrape),
    checkCreditsMiddleware(1),
    wrap(scrapeController)
);

v1Router.post(
    "/v1/crawl",
    authMiddleware(RateLimiterMode.Crawl),
    idempotencyMiddleware,
    checkCreditsMiddleware(1),
    wrap(crawlController)
);

v1Router.post(
    "/v1/map",
    authMiddleware(RateLimiterMode.Crawl),
    checkCreditsMiddleware(1),
    wrap(mapController)
);

v1Router.get(
    "/v1/crawl/:jobId",
    authMiddleware(RateLimiterMode.CrawlStatus),
    wrap(crawlStatusController)
);

// v1Router.post("/v1/crawlWebsitePreview", crawlPreviewController);
// v1Router.delete("/v1/crawl/:jobId", crawlCancelController);
// v1Router.get("/v1/checkJobStatus/:jobId", crawlJobStatusPreviewController);

// // Auth route for key based authentication
// v1Router.get("/v1/keyAuth", keyAuthController);

// // Search routes
// v0Router.post("/v1/search", searchController);

// Health/Probe routes
// v1Router.get("/v1/health/liveness", livenessController);
// v1Router.get("/v1/health/readiness", readinessController);

v1Router.use((err: unknown, req: Request<{}, ErrorResponse, undefined>, res: Response<ErrorResponse>, next: NextFunction) => {
    if (err instanceof ZodError) {
        res.status(400).json({ success: false, error: "Bad Request", details: err.errors });
    } else {
        const id = uuidv4();
        let verbose = JSON.stringify(err);
        if (verbose === "{}") {
            if (err instanceof Error) {
                verbose = JSON.stringify({
                    message: err.message,
                    name: err.name,
                    stack: err.stack,
                });
            }
        }

        Logger.error("Error occurred in request! (" + req.path + ") -- ID " + id  + " -- " + verbose);
        res.status(500).json({ success: false, error: "An unexpected error occurred. Please contact hello@firecrawl.com for help. Your exception ID is " + id + "" });
    }
});
