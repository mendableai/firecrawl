import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import { getWebScraperQueue } from "./services/queue-service";
import { addWebScraperJob } from "./services/queue-jobs";
import { supabase_service } from "./services/supabase";
import { WebScraperDataProvider } from "./scraper/WebScraper";
import { billTeam, checkTeamCredits } from "./services/billing/credit_billing";
import { getRateLimiter, redisClient } from "./services/rate-limiter";
import { parseApi } from "./lib/parseApi";
import { RateLimiterMode } from "./types";
import { v0Router } from "./routes/v0";

const { createBullBoard } = require("@bull-board/api");
const { BullAdapter } = require("@bull-board/api/bullAdapter");
const { ExpressAdapter } = require("@bull-board/express");

export const app = express();

global.isProduction = process.env.IS_PRODUCTION === "true";

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "10mb" }));

app.use(cors()); // Add this line to enable CORS

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(`/admin/${process.env.BULL_AUTH_KEY}/queues`);

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullAdapter(getWebScraperQueue())],
  serverAdapter: serverAdapter,
});

app.use(
  `/admin/${process.env.BULL_AUTH_KEY}/queues`,
  serverAdapter.getRouter()
);

app.get("/", (req, res) => {
  res.send("SCRAPERS-JS: Hello, world! Fly.io");
});

//write a simple test function
app.get("/test", async (req, res) => {
  res.send("Hello, world!");
});

// register router
app.use(v0Router);

const DEFAULT_PORT = process.env.PORT ?? 3002;
const HOST = process.env.HOST ?? "localhost";
redisClient.connect();

export function startServer(port = DEFAULT_PORT) {
  const server = app.listen(Number(port), HOST, () => {
    console.log(`Server listening on port ${port}`);
    console.log(
      `For the UI, open http://${HOST}:${port}/admin/${process.env.BULL_AUTH_KEY}/queues`
    );
    console.log("");
    console.log("1. Make sure Redis is running on port 6379 by default");
    console.log(
      "2. If you want to run nango, make sure you do port forwarding in 3002 using ngrok http 3002 "
    );
  });
  return server;
}

if (require.main === module) {
  startServer();
}

// Use this as a "health check" that way we dont destroy the server
app.get(`/admin/${process.env.BULL_AUTH_KEY}/queues`, async (req, res) => {
  try {
    const webScraperQueue = getWebScraperQueue();
    const [webScraperActive] = await Promise.all([
      webScraperQueue.getActiveCount(),
    ]);

    const noActiveJobs = webScraperActive === 0;
    // 200 if no active jobs, 503 if there are active jobs
    return res.status(noActiveJobs ? 200 : 500).json({
      webScraperActive,
      noActiveJobs,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/is-production", (req, res) => {
  res.send({ isProduction: global.isProduction });
});
