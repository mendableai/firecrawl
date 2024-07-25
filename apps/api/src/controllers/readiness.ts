import { Request, Response } from "express";

export async function readinessController(req: Request, res: Response) {
  // TODO: add checks when the application is ready to serve traffic
  res.status(200).json({ status: "ok" });
}
