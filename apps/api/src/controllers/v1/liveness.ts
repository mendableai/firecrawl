import { Request, Response } from "express";

/**
 * @openapi
 * /v1/health/liveness:
 *   get:
 *     tags:
 *       - Health
 *     summary: Check if service is alive
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
export async function livenessController(req: Request, res: Response) {
  //TODO: add checks if the application is live and healthy like checking the redis connection
  res.status(200).json({ status: "ok" });
}
