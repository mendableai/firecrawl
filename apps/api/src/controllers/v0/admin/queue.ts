import { Request, Response } from "express";

import { Job } from "bullmq";
import { logger } from "../../../lib/logger";
import { getScrapeQueue, getScrapeQueueByIndex, queueMultiplexWidth } from "../../../services/queue-service";
import { checkAlerts } from "../../../services/alerts";
import { sendSlackWebhook } from "../../../services/alerts/slack";

export async function checkQueuesController(req: Request, res: Response) {
  try {
    await checkAlerts();
    return res.status(200).send("Alerts initialized");
  } catch (error) {
    logger.debug(`Failed to initialize alerts: ${error}`);
    return res.status(500).send("Failed to initialize alerts");
  }
}

// Use this as a "health check" that way we dont destroy the server
export async function queuesController(req: Request, res: Response) {
  try {
    const scrapeQueues = new Array(queueMultiplexWidth)
      .fill(0)
      .map((_, index) => getScrapeQueueByIndex(index));

    const webScraperActive = (await Promise.all(scrapeQueues.map((queue) => queue.getActiveCount()))).reduce((a, b) => a + b, 0);

    const noActiveJobs = webScraperActive === 0;
    // 200 if no active jobs, 503 if there are active jobs
    return res.status(noActiveJobs ? 200 : 500).json({
      webScraperActive,
      noActiveJobs,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: error.message });
  }
}
