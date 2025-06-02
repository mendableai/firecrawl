import { Response } from "express";
import {
  OngoingCrawlsResponse,
  RequestWithAuth,
} from "./types";
import {
  getCrawlsByTeamId,
} from "../../lib/crawl-redis";
import { configDotenv } from "dotenv";
configDotenv();

export async function ongoingCrawlsController(
  req: RequestWithAuth<{}, undefined, OngoingCrawlsResponse>,
  res: Response<OngoingCrawlsResponse>,
) {
  const ids = await getCrawlsByTeamId(req.auth.team_id);

  res.status(200).json({
    success: true,
    ids,
  });
}
