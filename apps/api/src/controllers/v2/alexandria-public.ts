import type { NextFunction, Request, Response } from "express";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { validate as isUuid } from "uuid";
import { logger } from "../../lib/logger";
import { loadPublicResult } from "../../services/alexandria/public-results";
import { publicCapability } from "../../services/alexandria/public-results-allowlist";
import { redisRateLimitClient } from "../../services/rate-limiter";

const PUBLIC_CACHE_CONTROL = "public, max-age=60, s-maxage=300";
const PER_IP_PER_MINUTE = 120;

let limiter: RateLimiterRedis | undefined;

/**
 * Per-IP limit for the unauthenticated read. Fails open when Redis is down so a
 * limiter outage never takes the pages offline; the CDN absorbs most traffic.
 */
export async function alexandriaPublicRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  limiter ??= new RateLimiterRedis({
    storeClient: redisRateLimitClient,
    keyPrefix: "alexandria-public",
    points: PER_IP_PER_MINUTE,
    duration: 60,
  });
  try {
    await limiter.consume(req.ip || req.socket.remoteAddress || "unknown");
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil(error.msBeforeNext / 1000))),
      );
      return res.status(429).json({ success: false, error: "rate_limited" });
    }
    logger.warn("Alexandria public rate limiter unavailable", { error });
  }
  next();
}

const notFound = (res: Response) =>
  res
    .status(404)
    .setHeader("Cache-Control", "no-store")
    .json({ success: false, error: "not_found" });

/**
 * GET /v2/alexandria/public/:jobId — the sanitized public record for an
 * Alexandria job, for firecrawl.dev/artifacts/<jobId>. No auth and no team
 * information; the allowlist and kill switch are re-checked on every read.
 */
export async function alexandriaPublicResultController(
  req: Request<{ jobId: string }>,
  res: Response,
) {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const { jobId } = req.params;
  if (typeof jobId !== "string" || !isUuid(jobId))
    return res
      .status(400)
      .setHeader("Cache-Control", "no-store")
      .json({ success: false, error: "invalid_job_id" });

  const record = await loadPublicResult(jobId.toLowerCase());
  if (
    !record ||
    record.jobId !== jobId.toLowerCase() ||
    !publicCapability(record.provider, record.capability)
  )
    return notFound(res);

  res.setHeader("Cache-Control", PUBLIC_CACHE_CONTROL);
  return res.status(200).json({
    success: true,
    data: {
      jobId: record.jobId,
      provider: record.provider,
      capability: record.capability,
      createdVia: record.createdVia,
      fetchedAt: record.fetchedAt,
      params: record.params,
      payload: record.payload,
    },
  });
}
