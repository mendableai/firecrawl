import { PostHog } from "posthog-node";
import "dotenv/config";
import { logger } from "../../src/lib/logger";

export default function PostHogClient(apiKey: string) {
  const posthogClient = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  return posthogClient;
}

class MockPostHog {
  capture() {}
}

// Using the actual PostHog class if POSTHOG_API_KEY exists, otherwise using the mock class
// Additionally, print a warning to the terminal if POSTHOG_API_KEY is not provided
export const posthog = process.env.POSTHOG_API_KEY
  ? PostHogClient(process.env.POSTHOG_API_KEY)
  : (() => {
      logger.warn(
        "POSTHOG_API_KEY is not provided - your events will not be logged. Using MockPostHog as a fallback. See posthog.ts for more.",
      );
      return new MockPostHog();
    })();
