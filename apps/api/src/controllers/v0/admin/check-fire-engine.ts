import { logger } from "../../../lib/logger";
import * as Sentry from "@sentry/node";
import { Request, Response } from "express";

export async function checkFireEngine(req: Request, res: Response) {
  try {
    if (!process.env.FIRE_ENGINE_BETA_URL) {
      logger.warn("Fire engine beta URL not configured");
      return res.status(500).json({
        success: false,
        error: "Fire engine beta URL not configured",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        `${process.env.FIRE_ENGINE_BETA_URL}/scrape`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Disable-Cache": "true",
          },
          body: JSON.stringify({
            url: "https://example.com",
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeout);

      if (response.ok) {
        const responseData = await response.json();
        return res.status(200).json({
          data: responseData,
        });
      } else {
        return res.status(response.status).json({
          success: false,
          error: `Fire engine returned status ${response.status}`,
        });
      }
    } catch (error) {
      if (error.name === "AbortError") {
        return res.status(504).json({
          success: false,
          error: "Request timed out after 30 seconds",
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error(error);
    Sentry.captureException(error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
