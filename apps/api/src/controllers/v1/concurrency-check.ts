import { authenticateUser } from "../auth";
import {
  ConcurrencyCheckParams,
  ConcurrencyCheckResponse,
  RequestWithAuth,
} from "./types";
import { RateLimiterMode, PlanType } from "../../types";
import { Response } from "express";
import { redisConnection } from "../../services/queue-service";
import { getConcurrencyLimitMax } from "../../services/rate-limiter";

// Basically just middleware and error wrapping
export async function concurrencyCheckController(
  req: RequestWithAuth<ConcurrencyCheckParams, undefined, undefined>,
  res: Response<ConcurrencyCheckResponse>,
) {
  const concurrencyLimiterKey = "concurrency-limiter:" + req.auth.team_id;
  const now = Date.now();
  const activeJobsOfTeam = await redisConnection.zrangebyscore(
    concurrencyLimiterKey,
    now,
    Infinity,
  );

  const maxConcurrency = getConcurrencyLimitMax(
    req.auth.plan as PlanType,
    req.auth.team_id,
  );

  return res.status(200).json({
    success: true,
    concurrency: activeJobsOfTeam.length,
    maxConcurrency: maxConcurrency,
  });
}
