import "dotenv/config";
import { Logger } from "../lib/logger";

class MockLogtail {
  info(message: string, context?: Record<string, any>): void {
    Logger.debug(`${message} - ${context}`);
  }
  error(message: string, context: Record<string, any> = {}): void {
    Logger.error(`${message} - ${context}`);
  }
}

export const logtail = new MockLogtail();
