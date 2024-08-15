import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { RequestWithAuth } from "./types";

export async function crawlStatusController(req: RequestWithAuth, res: Response) {
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
}

