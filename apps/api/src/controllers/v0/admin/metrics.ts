import type { Request, Response } from "express";
import { redisEvictConnection } from "../../../services/redis";

export async function metricsController(_: Request, res: Response) {
    let cursor: string = "0";
    const metrics: Record<string, number> = {};
    do {
        const res = await redisEvictConnection.scan(cursor, "MATCH", "concurrency-limit-queue:*");
        cursor = res[0];

        const keys = res[1];

        for (const key of keys) {
            const teamId = key.split(":")[1];
            const jobCount = await redisEvictConnection.zcard(key);
            metrics[teamId] = jobCount;
        }
    } while (cursor !== "0");

    res.contentType("text/plain").send(`\
# HELP concurrency_limit_queue_job_count The number of jobs in the concurrency limit queue per team
# TYPE concurrency_limit_queue_job_count gauge
${Object.entries(metrics).map(([key, value]) => `concurrency_limit_queue_job_count{team_id="${key}"} ${value}`).join("\n")}
`);
}