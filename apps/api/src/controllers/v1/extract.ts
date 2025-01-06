import { Request, Response } from "express";
import {
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
} from "./types";
import { getExtractQueue } from "../../services/queue-service";
import * as Sentry from "@sentry/node";
import { v4 as uuidv4 } from "uuid";

/**
 * Extracts data from the provided URLs based on the request parameters.
 * Currently in beta.
 * @param req - The request object containing authentication and extraction details.
 * @param res - The response object to send the extraction results.
 * @returns A promise that resolves when the extraction process is complete.
 */
export async function extractController(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>,
) {
  const selfHosted = process.env.USE_DB_AUTHENTICATION !== "true";
  req.body = extractRequestSchema.parse(req.body);

  if (!req.auth.plan) {
    return res.status(400).json({
      success: false,
      error: "No plan specified",
      urlTrace: [],
    });
  }

  const extractId = crypto.randomUUID();
  const jobData = {
    request: req.body,
    teamId: req.auth.team_id,
    plan: req.auth.plan,
    subId: req.acuc?.sub_id,
    extractId,
  };

  if (Sentry.isInitialized()) {
    const size = JSON.stringify(jobData).length;
    await Sentry.startSpan(
      {
        name: "Add extract job",
        op: "queue.publish",
        attributes: {
          "messaging.message.id": extractId,
          "messaging.destination.name": getExtractQueue().name,
          "messaging.message.body.size": size,
        },
      },
      async (span) => {
        await getExtractQueue().add(extractId, {
          ...jobData,
          sentry: {
            trace: Sentry.spanToTraceHeader(span),
            baggage: Sentry.spanToBaggageHeader(span),
            size,
          },
        });
      },
    );
  } else {
    await getExtractQueue().add(extractId, jobData, {
      jobId: extractId,
    });
  }

  return res.status(202).json({
    success: true,
    id: extractId,
    urlTrace: [],
  });
}
