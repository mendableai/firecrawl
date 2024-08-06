import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import { getScrapeQueue, getWebScraperQueue } from "./services/queue-service";
import { v0Router } from "./routes/v0";
import { initSDK } from "@hyperdx/node-opentelemetry";
import cluster from "cluster";
import os from "os";
import { Logger } from "./lib/logger";
import { adminRouter } from "./routes/admin";
import { ScrapeEvents } from "./lib/scrape-events";
import http from 'node:http';
import https from 'node:https';
import CacheableLookup  from 'cacheable-lookup';
import { v1Router } from "./routes/v1";

const { createBullBoard } = require("@bull-board/api");
const { BullAdapter } = require("@bull-board/api/bullAdapter");
const { ExpressAdapter } = require("@bull-board/express");

const numCPUs = process.env.ENV === "local" ? 2 : os.cpus().length;
Logger.info(`Number of CPUs: ${numCPUs} available`);

const cacheable = new CacheableLookup({
  // this is important to avoid querying local hostnames see https://github.com/szmarczak/cacheable-lookup readme
  lookup:false
});

cacheable.install(http.globalAgent);
cacheable.install(https.globalAgent)

if (cluster.isMaster) {
  Logger.info(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    if (code !== null) {
      Logger.info(`Worker ${worker.process.pid} exited`);
      Logger.info("Starting a new worker");
      cluster.fork();
    }
  });
} else {
  const app = express();

  global.isProduction = process.env.IS_PRODUCTION === "true";

  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json({ limit: "10mb" }));

  app.use(cors()); // Add this line to enable CORS

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(`/admin/${process.env.BULL_AUTH_KEY}/queues`);

  const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
    queues: [new BullAdapter(getWebScraperQueue()), new BullAdapter(getScrapeQueue())],
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
  app.use(v1Router);
  app.use(adminRouter);

  const DEFAULT_PORT = process.env.PORT ?? 3002;
  const HOST = process.env.HOST ?? "localhost";

  // HyperDX OpenTelemetry
  if (process.env.ENV === "production") {
    initSDK({ consoleCapture: true, additionalInstrumentations: [] });
  }

  function startServer(port = DEFAULT_PORT) {
    const server = app.listen(Number(port), HOST, () => {
      Logger.info(`Worker ${process.pid} listening on port ${port}`);
      Logger.info(
        `For the Queue UI, open: http://${HOST}:${port}/admin/${process.env.BULL_AUTH_KEY}/queues`
      );
    });
    return server;
  }

  if (require.main === module) {
    startServer();
  }

  app.get(`/serverHealthCheck`, async (req, res) => {
    try {
      const webScraperQueue = getWebScraperQueue();
      const [waitingJobs] = await Promise.all([
        webScraperQueue.getWaitingCount(),
      ]);

      const noWaitingJobs = waitingJobs === 0;
      // 200 if no active jobs, 503 if there are active jobs
      return res.status(noWaitingJobs ? 200 : 500).json({
        waitingJobs,
      });
    } catch (error) {
      Logger.error(error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.get("/serverHealthCheck/notify", async (req, res) => {
    if (process.env.SLACK_WEBHOOK_URL) {
      const treshold = 1; // The treshold value for the active jobs
      const timeout = 60000; // 1 minute // The timeout value for the check in milliseconds

      const getWaitingJobsCount = async () => {
        const webScraperQueue = getWebScraperQueue();
        const [waitingJobsCount] = await Promise.all([
          webScraperQueue.getWaitingCount(),
        ]);

        return waitingJobsCount;
      };

      res.status(200).json({ message: "Check initiated" });

      const checkWaitingJobs = async () => {
        try {
          let waitingJobsCount = await getWaitingJobsCount();
          if (waitingJobsCount >= treshold) {
            setTimeout(async () => {
              // Re-check the waiting jobs count after the timeout
              waitingJobsCount = await getWaitingJobsCount();
              if (waitingJobsCount >= treshold) {
                const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
                const message = {
                  text: `⚠️ Warning: The number of active jobs (${waitingJobsCount}) has exceeded the threshold (${treshold}) for more than ${
                    timeout / 60000
                  } minute(s).`,
                };

                const response = await fetch(slackWebhookUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(message),
                });

                if (!response.ok) {
                  Logger.error("Failed to send Slack notification");
                }
              }
            }, timeout);
          }
        } catch (error) {
          Logger.debug(error);
        }
      };

      checkWaitingJobs();
    }
  });

  app.get("/is-production", (req, res) => {
    res.send({ isProduction: global.isProduction });
  });

  Logger.info(`Worker ${process.pid} started`);
}

// const wsq = getWebScraperQueue();

// wsq.on("waiting", j => ScrapeEvents.logJobEvent(j, "waiting"));
// wsq.on("active", j => ScrapeEvents.logJobEvent(j, "active"));
// wsq.on("completed", j => ScrapeEvents.logJobEvent(j, "completed"));
// wsq.on("paused", j => ScrapeEvents.logJobEvent(j, "paused"));
// wsq.on("resumed", j => ScrapeEvents.logJobEvent(j, "resumed"));
// wsq.on("removed", j => ScrapeEvents.logJobEvent(j, "removed"));
