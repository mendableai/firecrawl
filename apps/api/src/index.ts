import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import { getWebScraperQueue } from "./services/queue-service";
import { redisClient } from "./services/rate-limiter";
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

app.get(`/serverHealthCheck`, async (req, res) => {
  try {
    const webScraperQueue = getWebScraperQueue();
    const [activeJobs] = await Promise.all([
      webScraperQueue.getActiveCount(),
    ]);

    const noActiveJobs = activeJobs === 0;
    // 200 if no active jobs, 503 if there are active jobs
    return res.status(noActiveJobs ? 200 : 500).json({
      activeJobs,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/serverHealthCheck/notify', async (req, res) => {
  if (process.env.SLACK_WEBHOOK_URL) {
    const treshold = 5; // The treshold value for the active jobs
    const timeout = 60000; // 1 minute // The timeout value for the check in milliseconds

    const getActiveJobs = async () => {
      const webScraperQueue = getWebScraperQueue();
      const [activeJobs] = await Promise.all([
        webScraperQueue.getActiveCount(),
      ]);

      return activeJobs;
    };

    res.status(200).json({ message: "Check initiated" });

    const checkActiveJobs = async () => {
      try {
        let activeJobs = await getActiveJobs();
        if (activeJobs >= treshold) {
          setTimeout(async () => {
            activeJobs = await getActiveJobs(); // Re-check the active jobs count
            if (activeJobs >= treshold) {
              const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
              const message = {
                text: `⚠️ Warning: The number of active jobs (${activeJobs}) has exceeded the threshold (${treshold}) for more than ${timeout/60000} minute(s).`,
              };

              const response = await fetch(slackWebhookUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
              })
              
              if (!response.ok) {
                console.error('Failed to send Slack notification')
              }
            }
          }, timeout);
        }
      } catch (error) {
        console.error(error);
      }
    };

    checkActiveJobs();
  }
});


app.get("/is-production", (req, res) => {
  res.send({ isProduction: global.isProduction });
});
