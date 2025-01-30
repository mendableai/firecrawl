import { Logger } from "winston";
import * as Sentry from "@sentry/node";
import { z } from "zod";

import { Action } from "../../../../lib/entities";
import { robustFetch } from "../../lib/fetch";
import { MockState } from "../../lib/mock";

export type FireEngineScrapeRequestCommon = {
  url: string;

  headers?: { [K: string]: string };

  blockMedia?: boolean; // default: true
  blockAds?: boolean; // default: true
  // pageOptions?: any; // unused, .scrollXPaths is considered on FE side

  // useProxy?: boolean; // unused, default: true
  // customProxy?: string; // unused

  // disableSmartWaitCache?: boolean; // unused, default: false
  // skipDnsCheck?: boolean; // unused, default: false

  priority?: number; // default: 1
  // team_id?: string; // unused
  logRequest?: boolean; // default: true
  instantReturn?: boolean; // default: false
  geolocation?: { country?: string; languages?: string[] };

  timeout?: number;
};

export type FireEngineScrapeRequestChromeCDP = {
  engine: "chrome-cdp";
  skipTlsVerification?: boolean;
  actions?: Action[];
  blockMedia?: true; // cannot be false
  mobile?: boolean;
  disableSmartWaitCache?: boolean;
  blockAds?: boolean; // default: true
};

export type FireEngineScrapeRequestPlaywright = {
  engine: "playwright";
  blockAds?: boolean; // default: true

  // mutually exclusive, default: false
  screenshot?: boolean;
  fullPageScreenshot?: boolean;

  wait?: number; // default: 0
};

export type FireEngineScrapeRequestTLSClient = {
  engine: "tlsclient";
  atsv?: boolean; // v0 only, default: false
  disableJsDom?: boolean; // v0 only, default: false
  // blockAds?: boolean; // default: true
};

const schema = z.object({
  jobId: z.string(),
  processing: z.boolean(),
});

export async function fireEngineScrape<
  Engine extends
    | FireEngineScrapeRequestChromeCDP
    | FireEngineScrapeRequestPlaywright
    | FireEngineScrapeRequestTLSClient,
>(
  logger: Logger,
  request: FireEngineScrapeRequestCommon & Engine,
  mock: MockState | null,
): Promise<z.infer<typeof schema>> {
  const fireEngineURL = process.env.FIRE_ENGINE_BETA_URL!;

  // TODO: retries

  const scrapeRequest = await Sentry.startSpan(
    {
      name: "fire-engine: Scrape",
      attributes: {
        url: request.url,
      },
    },
    async (span) => {
      return await robustFetch({
        url: `${fireEngineURL}/scrape`,
        method: "POST",
        headers: {
          ...(Sentry.isInitialized()
            ? {
                "sentry-trace": Sentry.spanToTraceHeader(span),
                baggage: Sentry.spanToBaggageHeader(span),
              }
            : {}),
        },
        body: request,
        logger: logger.child({ method: "fireEngineScrape/robustFetch" }),
        schema,
        tryCount: 3,
        mock,
      });
    },
  );

  return scrapeRequest;
}
