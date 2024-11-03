// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { Logger } from "../lib/logger";

if (process.env.SENTRY_DSN) {
  Logger.info("Setting up Sentry...");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: process.env.SENTRY_ENVIRONMENT === "dev" ? 1.0 : 0.045,
    profilesSampleRate: 1.0,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  });
}
