import { Request, Response } from "express";
import { authenticateUser } from "../auth";
import { RateLimiterMode } from "../../types";
import { Logger } from "../../lib/logger";
import { getCrawl, saveCrawl } from "../../lib/crawl-redis";
import { configDotenv } from "dotenv";
configDotenv();

/**
 * @openapi
 * /v1/crawl/{jobId}:
 *   delete:
 *     tags:
 *       - Crawling
 *     summary: Cancel a crawl job
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: jobId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 */
export async function crawlCancelController(req: Request, res: Response) {
  try {
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.CrawlStatus
    );
    if (!success) {
      return res.status(status).json({ error });
    }

    const sc = await getCrawl(req.params.jobId);
    if (!sc) {
      return res.status(404).json({ error: "Job not found" });
    }

    try {
      sc.cancelled = true;
      await saveCrawl(req.params.jobId, sc);
    } catch (error) {
      Logger.error(error);
    }

    res.json({
      status: "cancelled"
    });
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
