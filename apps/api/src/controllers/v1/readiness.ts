import { Request, Response } from "express";

/**
 * @openapi
 * /v1/health/readiness:
 *   get:
 *     tags:
 *       - Health
 *     summary: Check if service is ready
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
export async function readinessController(req: Request, res: Response) {
  // TODO: add checks when the application is ready to serve traffic
  res.status(200).json({ status: "ok" });
}
