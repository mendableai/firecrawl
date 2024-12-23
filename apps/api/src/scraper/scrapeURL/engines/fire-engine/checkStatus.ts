import { Logger } from "winston";
import * as Sentry from "@sentry/node";
import { z } from "zod";

import { robustFetch } from "../../lib/fetch";
import { ActionError, EngineError, SiteError } from "../../error";

const successSchema = z.object({
  jobId: z.string(),
  state: z.literal("completed"),
  processing: z.literal(false),

  // timeTaken: z.number(),
  content: z.string(),
  url: z.string().optional(),

  pageStatusCode: z.number(),
  pageError: z.string().optional(),

  // TODO: this needs to be non-optional, might need fixes on f-e side to ensure reliability
  responseHeaders: z.record(z.string(), z.string()).optional(),

  // timeTakenCookie: z.number().optional(),
  // timeTakenRequest: z.number().optional(),

  // legacy: playwright only
  screenshot: z.string().optional(),

  // new: actions
  screenshots: z.string().array().optional(),
  actionContent: z
    .object({
      url: z.string(),
      html: z.string(),
    })
    .array()
    .optional(),
});

export type FireEngineCheckStatusSuccess = z.infer<typeof successSchema>;

const processingSchema = z.object({
  jobId: z.string(),
  state: z.enum([
    "delayed",
    "active",
    "waiting",
    "waiting-children",
    "unknown",
    "prioritized",
  ]),
  processing: z.boolean(),
});

const failedSchema = z.object({
  jobId: z.string(),
  state: z.literal("failed"),
  processing: z.literal(false),
  error: z.string(),
});

export class StillProcessingError extends Error {
  constructor(jobId: string) {
    super("Job is still under processing", { cause: { jobId } });
  }
}

export async function fireEngineCheckStatus(
  logger: Logger,
  jobId: string,
): Promise<FireEngineCheckStatusSuccess> {
  const fireEngineURL = process.env.FIRE_ENGINE_BETA_URL!;

  const status = await Sentry.startSpan(
    {
      name: "fire-engine: Check status",
      attributes: {
        jobId,
      },
    },
    async (span) => {
      return await robustFetch({
        url: `${fireEngineURL}/scrape/${jobId}`,
        method: "GET",
        logger: logger.child({ method: "fireEngineCheckStatus/robustFetch" }),
        headers: {
          ...(Sentry.isInitialized()
            ? {
                "sentry-trace": Sentry.spanToTraceHeader(span),
                baggage: Sentry.spanToBaggageHeader(span),
              }
            : {}),
        },
      });
    },
  );

  const successParse = successSchema.safeParse(status);
  const processingParse = processingSchema.safeParse(status);
  const failedParse = failedSchema.safeParse(status);

  if (successParse.success) {
    logger.debug("Scrape succeeded!", { jobId });
    return successParse.data;
  } else if (processingParse.success) {
    throw new StillProcessingError(jobId);
  } else if (failedParse.success) {
    logger.debug("Scrape job failed", { status, jobId });
    if (
      typeof status.error === "string" &&
      status.error.includes("Chrome error: ")
    ) {
      throw new SiteError(status.error.split("Chrome error: ")[1]);
    } else if (
      typeof status.error === "string" &&
      // TODO: improve this later
      status.error.includes("Element")
    ) {
      throw new ActionError(status.error.split("Error: ")[1]);
    } else {
      throw new EngineError("Scrape job failed", {
        cause: {
          status,
          jobId,
        },
      });
    }
  } else {
    logger.debug("Check status returned response not matched by any schema", {
      status,
      jobId,
    });
    throw new Error(
      "Check status returned response not matched by any schema",
      {
        cause: {
          status,
          jobId,
        },
      },
    );
  }
}
