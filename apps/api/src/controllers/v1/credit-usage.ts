import { Request, Response } from "express";
import { RequestWithAuth } from "./types";
import { getACUC } from "../auth";
import { logger } from "../../lib/logger";

export async function creditUsageController(
  req: RequestWithAuth,
  res: Response,
): Promise<void> {
  try {
    // If we already have the credit usage info from auth, use it
    if (req.acuc) {
      res.json({
        success: true,
        data: {
          remaining_credits: req.acuc.remaining_credits,
        },
      });
      return;
    }

    // Otherwise fetch fresh data
    const chunk = await getACUC(req.auth.team_id);
    if (!chunk) {
      res.status(404).json({
        success: false,
        error: "Could not find credit usage information",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        remaining_credits: chunk.remaining_credits,
      },
    });
  } catch (error) {
    logger.error("Error in credit usage controller:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error while fetching credit usage",
    });
  }
}
