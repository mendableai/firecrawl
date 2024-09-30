import { Logtail } from "@logtail/node";
import "dotenv/config";
import { logger } from "../lib/logger";

// A mock Logtail class to handle cases where LOGTAIL_KEY is not provided
class MockLogtail {
  info(message: string, context?: Record<string, any>): void {
    logger.debug(`${message} - ${context}`);
  }
  error(message: string, context: Record<string, any> = {}): void {
    logger.error(`${message} - ${context}`);
  }
}

// Using the actual Logtail class if LOGTAIL_KEY exists, otherwise using the mock class
// Additionally, print a warning to the terminal if LOGTAIL_KEY is not provided
export const logtail = process.env.LOGTAIL_KEY ? new Logtail(process.env.LOGTAIL_KEY) : (() => {
  logger.warn("LOGTAIL_KEY is not provided - your events will not be logged. Using MockLogtail as a fallback. see logtail.ts for more.");
  return new MockLogtail();
})();
