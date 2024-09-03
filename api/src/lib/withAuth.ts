import { AuthResponse } from "../../src/types";
import { Logger } from "./logger";

let warningCount = 0;

export function withAuth<T extends AuthResponse, U extends any[]>(
  originalFunction: (...args: U) => Promise<T>
) {
  return async function (...args: U): Promise<T> {
    if (process.env.USE_DB_AUTHENTICATION === "false") {
      if (warningCount < 5) {
        Logger.warn("You're bypassing authentication");
        warningCount++;
      }
      return { success: true } as T;
    } else {
      try {
        return await originalFunction(...args);
      } catch (error) {
        Logger.error(`Error in withAuth function: ${error}`);
        return { success: false, error: error.message } as T;
      }
    }
  };
}
