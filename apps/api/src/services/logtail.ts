import { Logtail } from "@logtail/node";
import "dotenv/config";

// A mock Logtail class to handle cases where LOGTAIL_KEY is not provided
class MockLogtail {
  info(message: string, context?: Record<string, any>): void {
    console.log(message, context);
  }
  error(message: string, context: Record<string, any> = {}): void {
    console.error(message, context);
  }
}

// Using the actual Logtail class if LOGTAIL_KEY exists, otherwise using the mock class
// Additionally, print a warning to the terminal if LOGTAIL_KEY is not provided
export const logtail = process.env.LOGTAIL_KEY ? new Logtail(process.env.LOGTAIL_KEY) : (() => {
  console.warn("LOGTAIL_KEY is not provided - your events will not be logged. Using MockLogtail as a fallback. see logtail.ts for more.");
  return new MockLogtail();
})();
