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

async function authenticateUser(req, res, mode?: string): Promise<{ success: boolean, team_id?: string, error?: string, status?: number }> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { success: false, error: "Unauthorized", status: 401 };
  }
  const token = authHeader.split(" ")[1]; // Extract the token from "Bearer <token>"
  if (!token) {
    return { success: false, error: "Unauthorized: Token missing", status: 401 };
  }

  try {
    const incomingIP = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress) as string;
    const iptoken = incomingIP + token;
    await getRateLimiter(
      token === "this_is_just_a_preview_token" ? true : false
    ).consume(iptoken);
  } catch (rateLimiterRes) {
    console.error(rateLimiterRes);
    return { success: false, error: "Rate limit exceeded. Too many requests, try again in 1 minute.", status: 429 };
  }

  if (token === "this_is_just_a_preview_token" && mode === "scrape") {
    return { success: true, team_id: "preview" };
  }

  const normalizedApi = parseApi(token);
  // make sure api key is valid, based on the api_keys table in supabase
  const { data, error } = await supabase_service
    .from("api_keys")
    .select("*")
    .eq("key", normalizedApi);
  if (error || !data || data.length === 0) {
    return { success: false, error: "Unauthorized: Invalid token", status: 401 };
  }

  return { success: true, team_id: data[0].team_id };
}

app.post("/v0/scrape", async (req, res) => {
  try {
    // make sure to authenticate user first, Bearer <token>
    const { success, team_id, error, status } = await authenticateUser(req, res, "scrape");
    if (!success) {
      return res.status(status).json({ error });
    }
    const crawlerOptions = req.body.crawlerOptions ?? {};

    try {
      const { success: creditsCheckSuccess, message: creditsCheckMessage } =
        await checkTeamCredits(team_id, 1);
      if (!creditsCheckSuccess) {
        return res.status(402).json({ error: "Insufficient credits" });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }

    // authenticate on supabase
    const url = req.body.url;
    if (!url) {
      return res.status(400).json({ error: "Url is required" });
    }

    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false };

    try {
      const a = new WebScraperDataProvider();
      await a.setOptions({
        mode: "single_urls",
        urls: [url],
        crawlerOptions: {
          ...crawlerOptions,
        },
        pageOptions: pageOptions,
      });

      const docs = await a.getDocuments(false);
      // make sure doc.content is not empty
      const filteredDocs = docs.filter(
        (doc: { content?: string }) =>
          doc.content && doc.content.trim().length > 0
      );
      if (filteredDocs.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
      const { success, credit_usage } = await billTeam(
        team_id,
        filteredDocs.length
      );
      if (!success) {
        // throw new Error("Failed to bill team, no subscription was found");
        // return {
        //   success: false,
        //   message: "Failed to bill team, no subscription was found",
        //   docs: [],
        // };
        return res
          .status(402)
          .json({ error: "Failed to bill, no subscription was found" });
      }
      return res.json({
        success: true,
        data: filteredDocs[0],
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/v0/crawl", async (req, res) => {
  try {
    const { success, team_id, error, status } = await authenticateUser(req, res, "crawl");
    if (!success) {
      return res.status(status).json({ error });
    }

    const { success: creditsCheckSuccess, message: creditsCheckMessage } =
      await checkTeamCredits(team_id, 1);
    if (!creditsCheckSuccess) {
      return res.status(402).json({ error: "Insufficient credits" });
    }

    // authenticate on supabase
    const url = req.body.url;
    if (!url) {
      return res.status(400).json({ error: "Url is required" });
    }
    const mode = req.body.mode ?? "crawl";
    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false };

    if (mode === "single_urls" && !url.includes(",")) {
      try {
        const a = new WebScraperDataProvider();
        await a.setOptions({
          mode: "single_urls",
          urls: [url],
          crawlerOptions: {
            returnOnlyUrls: true,
          },
          pageOptions: pageOptions,
        });

        const docs = await a.getDocuments(false, (progress) => {
          job.progress({
            current: progress.current,
            total: progress.total,
            current_step: "SCRAPING",
            current_url: progress.currentDocumentUrl,
          });
        });
        return res.json({
          success: true,
          documents: docs,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
      }
    }
    const job = await addWebScraperJob({
      url: url,
      mode: mode ?? "crawl", // fix for single urls not working
      crawlerOptions: { ...crawlerOptions },
      team_id: team_id,
      pageOptions: pageOptions,

    });

    res.json({ jobId: job.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});
app.post("/v0/crawlWebsitePreview", async (req, res) => {
  try {
    const { success, team_id, error, status } = await authenticateUser(req, res, "scrape");
    if (!success) {
      return res.status(status).json({ error });
    } 
    // authenticate on supabase
    const url = req.body.url;
    if (!url) {
      return res.status(400).json({ error: "Url is required" });
    }
    const mode = req.body.mode ?? "crawl";
    const crawlerOptions = req.body.crawlerOptions ?? {};
    const pageOptions = req.body.pageOptions ?? { onlyMainContent: false };
    const job = await addWebScraperJob({
      url: url,
      mode: mode ?? "crawl", // fix for single urls not working
      crawlerOptions: { ...crawlerOptions, limit: 5, maxCrawledLinks: 5 },
      team_id: "preview",
      pageOptions: pageOptions,
    });

    res.json({ jobId: job.id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/v0/crawl/status/:jobId", async (req, res) => {
  try {
    const { success, team_id, error, status } = await authenticateUser(req, res, "scrape");
    if (!success) {
      return res.status(status).json({ error });
    }
    const job = await getWebScraperQueue().getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const { current, current_url, total, current_step } = await job.progress();
    res.json({
      status: await job.getState(),
      // progress: job.progress(),
      current: current,
      current_url: current_url,
      current_step: current_step,
      total: total,
      data: job.returnvalue,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/v0/checkJobStatus/:jobId", async (req, res) => {
  try {
    const job = await getWebScraperQueue().getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const { current, current_url, total, current_step } = await job.progress();
    res.json({
      status: await job.getState(),
      // progress: job.progress(),
      current: current,
      current_url: current_url,
      current_step: current_step,
      total: total,
      data: job.returnvalue,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

const DEFAULT_PORT = process.env.PORT ?? 3002;
const HOST = process.env.HOST ?? "localhost";
redisClient.connect();

export function startServer(port = DEFAULT_PORT) {
  const server = app.listen(Number(port), HOST, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`For the UI, open http://${HOST}:${port}/admin/${process.env.BULL_AUTH_KEY}/queues`);
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

