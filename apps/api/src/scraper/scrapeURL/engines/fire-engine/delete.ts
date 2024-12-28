import { Logger } from "winston";
import * as Sentry from "@sentry/node";

import { robustFetch } from "../../lib/fetch";

export async function fireEngineDelete(logger: Logger, jobId: string) {
  const fireEngineURL = process.env.FIRE_ENGINE_BETA_URL!;

  await Sentry.startSpan(
    {
      name: "fire-engine: Delete scrape",
      attributes: {
        jobId,
      },
    },
    async (span) => {
      await robustFetch({
        url: `${fireEngineURL}/scrape/${jobId}`,
        method: "DELETE",
        headers: {
          ...(Sentry.isInitialized()
            ? {
                "sentry-trace": Sentry.spanToTraceHeader(span),
                baggage: Sentry.spanToBaggageHeader(span),
              }
            : {}),
        },
        ignoreResponse: true,
        ignoreFailure: true,
        logger: logger.child({ method: "fireEngineDelete/robustFetch", jobId }),
      });
    },
  );

  // We do not care whether this fails or not.
}
