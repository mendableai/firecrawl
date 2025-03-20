import { Request, Response } from "express";
import {
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
} from "./types";
// import { getExtractQueue } from "../../services/queue-service";
// import * as Sentry from "@sentry/node";
// import { saveExtract } from "../../lib/extract/extract-redis";
// import { getTeamIdSyncB } from "../../lib/extract/team-id-sync";
import { performExtraction } from "../../lib/extract/extract-reranker-only";

/**
 * Extracts data from the provided URLs based on the request parameters.
 * Currently in beta.
 * @param req - The request object containing authentication and extraction details.
 * @param res - The response object to send the extraction results.
 * @returns A promise that resolves when the extraction process is complete.
 */
export async function extractRerankOnlyController(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>,
) {
  // const selfHosted = process.env.USE_DB_AUTHENTICATION !== "true";
  req.body = extractRequestSchema.parse(req.body);

  const extractId = crypto.randomUUID();
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
