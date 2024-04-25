import { Request, Response } from "express";
import { authenticateUser } from "./auth";
import { RateLimiterMode } from "../../src/types";
import { getWebScraperQueue } from "../../src/services/queue-service";

export async function crawlStatusController(req: Request, res: Response) {
    let result = [];
    let responseSent = false;

    try {
        const { success, team_id, error, status } = await authenticateUser(req, res, RateLimiterMode.CrawlStatus);
        if (!success) {
            responseSent = true;
            return res.status(status).json({ error });
        }
        
        const job = await getWebScraperQueue().getJob(req.params.jobId);
        if (!job) {
            responseSent = true;
            return res.status(404).json({ error: "Job not found" });
        }

        const timeoutValue = req.query.timeout ? parseInt(req.query.timeout.toString())  : 1000;  
        const timeoutFunction = setTimeout(() => {
            if (!responseSent) {
                responseSent = true;
                res.status(408).json({ error: "Time Limit exceeded", results: result });
            }
        }, timeoutValue);

        const { current, current_url, total, current_step } = await job.progress();
        result.push({
            status: await job.getState(),
            current: current,
            current_url: current_url,
            current_step: current_step,
            total: total,
            data: job.returnvalue,
        });

        clearTimeout(timeoutFunction);
        if (!responseSent) {
            responseSent = true;
            res.status(200).json({ success: true, result });
        }
    } catch (error) {
        console.error(error);
        if (!responseSent) {
            responseSent = true;
            res.status(500).json({ error: error.message });
        }
    }
}
