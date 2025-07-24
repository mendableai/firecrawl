import express from "express";
import { RateLimiterMode } from "../types";
import expressWs from "express-ws";
import { searchController } from "../controllers/v2/search";
import {
  authMiddleware,
  checkCreditsMiddleware,
  wrap,
} from "./shared";

expressWs(express());

export const v2Router = express.Router();

v2Router.post(
  "/search",
  authMiddleware(RateLimiterMode.Search),
  checkCreditsMiddleware(),
  wrap(searchController),
);
