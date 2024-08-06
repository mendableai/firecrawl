import { Request, Response } from "express";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../../src/types";
import { addWebScraperJob } from "../../../src/services/queue-jobs";
import { getWebScraperQueue } from "../../../src/services/queue-service";
import { supabaseGetJobById } from "../../../src/lib/supabase-jobs";
import { Logger } from "../../../src/lib/logger";
import { v4 as uuidv4 } from "uuid";

export async function crawlStatusController(req: Request, res: Response) {
  // TODO: validate req.params.jobId

  try {    
    const { success, team_id, error, status } = await authenticateUser(
      req,
      res,
      RateLimiterMode.CrawlStatus
    );
    if (!success) {
      return res.status(status).json({ error });
    }

    // const job = await getWebScraperQueue().getJob(req.params.jobId);
    // if (!job) {
    //   return res.status(404).json({ error: "Job not found" });
    // }

    // const { current, current_url, total, current_step, partialDocs } = await job.progress();

    // let data = job.returnvalue;
    // if (process.env.USE_DB_AUTHENTICATION === "true") {
    //   const supabaseData = await supabaseGetJobById(req.params.jobId);

    //   if (supabaseData) {
    //     data = supabaseData.docs;
    //   }
    // }

    // const jobStatus = await job.getState();

    // mock:
    const id = uuidv4();
    const result = {
      totalCount: 100,
      creditsUsed: 2,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).getTime(),
      status: "scraping", // scraping, completed, failed
      next: `${req.protocol}://${req.get("host")}/v1/crawl/${id}`,
      data: [{
        markdown: "test",
        content: "test",
        html: "test",
        rawHtml: "test",
        linksOnPage: ["test1", "test2"],
        screenshot: "test",
        metadata: {
          title: "test",
          description: "test",
          language: "test",
          sourceURL: "test",
          statusCode: 200,
          error: "test"
        }
      },
      {
        markdown: "test",
        content: "test",
        html: "test",
        rawHtml: "test",
        linksOnPage: ["test1", "test2"],
        screenshot: "test",
        metadata: {
          title: "test",
          description: "test",
          language: "test",
          sourceURL: "test",
          statusCode: 200,
          error: "test"
        }
      }]
    }

    res.status(200).json(result);
  } catch (error) {
    Logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}

