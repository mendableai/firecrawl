import { Request, Response } from "express";
import {
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
} from "./types";
import { performExtraction } from "../../lib/extract/extraction-service";

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

  const result = await performExtraction({
    request: req.body,
    teamId: req.auth.team_id,
    plan: req.auth.plan,
    subId: req.acuc?.sub_id || undefined,
  });

  return res.status(result.success ? 200 : 400).json(result);
}
