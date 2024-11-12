import { Request, Response } from "express";
import {
  Document,
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
  MapDocument,
} from "./types";

export async function extractController(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>
) {
  req.body = extractRequestSchema.parse(req.body);

  return res.status(200).json({
    success: true,
    data: {} as Document,
    scrape_id: undefined,
  });
}
