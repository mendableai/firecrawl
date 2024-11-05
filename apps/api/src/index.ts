import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { getScrapeQueue } from "./services/queue-service";
import cluster from "cluster";
import os from "os";
import { Logger } from "./lib/logger";
import { adminRouter } from "./routes/admin";
import http from "node:http";
import https from "node:https";
import CacheableLookup from "cacheable-lookup";
import { v1Router } from "./routes/v1";
import expressWs from "express-ws";
import { ErrorResponse, ResponseWithSentry } from "./controllers/v1/types";
import { ZodError } from "zod";
import { v4 as uuidv4 } from "uuid";

const numCPUs = process.env.ENV === "local" ? 2 : os.cpus().length;
Logger.info(`Number of CPUs: ${numCPUs} available`);

const cacheable = new CacheableLookup({
  // this is important to avoid querying local hostnames see https://github.com/szmarczak/cacheable-lookup readme
  lookup: false,
});

cacheable.install(http.globalAgent);
cacheable.install(https.globalAgent);

if (cluster.isPrimary) {
  Logger.info(`Primary ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code) => {
    if (code !== null) {
      Logger.info(`Worker ${worker.process.pid} exited`);
      Logger.info("Starting a new worker");
      cluster.fork();
    }
  });
} else {
  const ws = expressWs(express());
  const app = ws.app;

  global.isProduction = process.env.IS_PRODUCTION === "true";

  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json({ limit: "10mb" }));

  app.use(cors()); // Add this line to enable CORS

  app.use("/v1", v1Router);
  app.use(adminRouter);

  const DEFAULT_PORT = process.env.PORT ?? 3002;
  const HOST = process.env.HOST ?? "localhost";

  function startServer(port = DEFAULT_PORT) {
    const server = app.listen(Number(port), HOST, () => {
      Logger.info(`Worker ${process.pid} listening on port ${port}`);
    });
    return server;
  }

  if (require.main === module) {
    startServer();
  }

  app.get(`/serverHealthCheck`, async (req, res) => {
    try {
      const scrapeQueue = getScrapeQueue();
      const [waitingJobs] = await Promise.all([scrapeQueue.getWaitingCount()]);

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

  app.get("/is-production", (req, res) => {
    res.send({ isProduction: global.isProduction });
  });

  app.use(
    (
      err: unknown,
      req: Request<{}, ErrorResponse, undefined>,
      res: Response<ErrorResponse>,
      next: NextFunction
    ) => {
      if (err instanceof ZodError) {
        res
          .status(400)
          .json({ success: false, error: "Bad Request", details: err.errors });
      } else {
        next(err);
      }
    }
  );

  app.use(
    (
      err: unknown,
      req: Request<{}, ErrorResponse, undefined>,
      res: ResponseWithSentry<ErrorResponse>,
      next: NextFunction
    ) => {
      if (
        err instanceof SyntaxError &&
        "status" in err &&
        err.status === 400 &&
        "body" in err
      ) {
        return res
          .status(400)
          .json({ success: false, error: "Bad request, malformed JSON" });
      }

      const id = res.sentry ?? uuidv4();
      let verbose = JSON.stringify(err);
      if (verbose === "{}") {
        if (err instanceof Error) {
          verbose = JSON.stringify({
            message: err.message,
            name: err.name,
            stack: err.stack,
          });
        }
      }

      Logger.error(
        "Error occurred in request! (" +
          req.path +
          ") -- ID " +
          id +
          " -- " +
          verbose
      );
      res.status(500).json({
        success: false,
        error:
          "An unexpected error occurred. Please contact hello@firecrawl.com for help. Your exception ID is " +
          id,
      });
    }
  );

  Logger.info(`Worker ${process.pid} started`);
}
