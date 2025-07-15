import { Logger } from "winston";
import * as Sentry from "@sentry/node";

import { robustFetch } from "../../lib/fetch";
import { MockState } from "../../lib/mock";
import { fireEngineStagingURL, fireEngineURL } from "./scrape";

export async function fireEngineDelete(
  logger: Logger,
  jobId: string,
  mock: MockState | null,
  abort?: AbortSignal,
  production = true,
) {
  await Sentry.startSpan(
    {
      name: "fire-engine: Delete scrape",
      attributes: {
        jobId,
      },
    },
    async (span) => {
      await robustFetch({
        url: `${production ? fireEngineURL : fireEngineStagingURL}/scrape/${jobId}`,
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
        mock,
        abort,
      });
    },
  );

  // We do not care whether this fails or not.
}
