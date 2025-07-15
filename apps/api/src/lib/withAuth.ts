import { AuthResponse } from "../../src/types";
import { logger } from "./logger";
import * as Sentry from "@sentry/node";
import { configDotenv } from "dotenv";
configDotenv();

let warningCount = 0;

export function withAuth<T, U extends any[]>(
  originalFunction: (...args: U) => Promise<T>,
  mockSuccess: T,
) {
  return async function (...args: U): Promise<T> {
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === "true";
    if (!useDbAuthentication) {
      if (warningCount < 5) {
        logger.warn("You're bypassing authentication");
        warningCount++;
      }
      return { success: true, ...(mockSuccess || {}) } as T;
    } else {
      return await originalFunction(...args);
    }
  };
}
