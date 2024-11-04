import { AuthResponse } from "../../src/types";
import { Logger } from "./logger";
import * as Sentry from "@sentry/node";
import { configDotenv } from "dotenv";
configDotenv();

let warningCount = 0;

export function withAuth<T extends AuthResponse, U extends any[]>(
  originalFunction: (...args: U) => Promise<T>
) {
  return async function (...args: U): Promise<T> {
    const useDbAuthentication = process.env.USE_DB_AUTHENTICATION === 'true';
    if (!useDbAuthentication) {
      if (warningCount < 5) {
        Logger.warn("You're bypassing authentication");
        warningCount++;
      }
      return { success: true } as T;
    } else {
      try {
        return await originalFunction(...args);
      } catch (error) {
        Sentry.captureException(error);
        Logger.error(`Error in withAuth function: ${error}`);
        return { success: false, error: error.message } as T;
      }
    }
  };
}
