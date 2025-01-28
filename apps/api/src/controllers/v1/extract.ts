import { Request, Response } from "express";
import {
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
} from "./types";
import { getExtractQueue } from "../../services/queue-service";
import * as Sentry from "@sentry/node";
import { saveExtract } from "../../lib/extract/extract-redis";
import { getTeamIdSyncB } from "../../lib/extract/team-id-sync";
import { performExtraction } from "../../lib/extract/extraction-service";

export async function oldExtract(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>,
  extractId: string,
) {
  // Means that are in the non-queue system
  // TODO: Remove this once all teams have transitioned to the new system
  try {
    const result = await performExtraction(extractId, {
      request: req.body,
      teamId: req.auth.team_id,
      plan: req.auth.plan ?? "free",
      subId: req.acuc?.sub_id ?? undefined,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
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

  const extractId = crypto.randomUUID();
  const jobData = {
    request: req.body,
    teamId: req.auth.team_id,
    plan: req.auth.plan,
    subId: req.acuc?.sub_id,
    extractId,
  };

  if (
    (await getTeamIdSyncB(req.auth.team_id)) &&
    req.body.origin !== "api-sdk" &&
    req.body.origin !== "website"
  ) {
    return await oldExtract(req, res, extractId);
  }

  await saveExtract(extractId, {
    id: extractId,
    team_id: req.auth.team_id,
    plan: req.auth.plan,
    createdAt: Date.now(),
    status: "processing",
    showSteps: req.body.__experimental_streamSteps,
    showLLMUsage: req.body.__experimental_llmUsage,
    showSources: req.body.__experimental_showSources,
  });

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
        }, { jobId: extractId });
      },
    );
  } else {
    await getExtractQueue().add(extractId, jobData, {
      jobId: extractId,
    });
  }

  return res.status(200).json({
    success: true,
    id: extractId,
    urlTrace: [],
  });
}
