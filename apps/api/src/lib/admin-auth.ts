import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { logAuthDenied } from "./auth-denied-log";
import { logger } from "./logger";

export function bearerToken(
  value: string | string[] | undefined,
): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export function secretsMatch(
  provided: string | null,
  expected?: string,
): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Accepts `Authorization: Bearer` matching BULL_AUTH_KEY, or BULL_AUTH_KEY_PREVIOUS
 * while callers move to a new key. Logs which key matched, never its value.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const provided = bearerToken(req.headers.authorization);
  const current = secretsMatch(provided, config.BULL_AUTH_KEY);
  const previous = secretsMatch(provided, config.BULL_AUTH_KEY_PREVIOUS);

  if (!current && !previous) {
    logAuthDenied(
      req,
      401,
      !req.headers.authorization
        ? "missing_credentials"
        : provided
          ? "unknown_key"
          : "malformed_authorization",
    );
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  logger.info(`Admin request ${req.method} ${req.baseUrl}${req.path}`, {
    matchedKey: current ? "current" : "previous",
  });
  next();
}
