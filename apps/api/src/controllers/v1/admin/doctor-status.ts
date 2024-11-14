import { Request, Response } from "express";
import { logger as _logger } from "../../../lib/logger";
import { ScrapeUrlResponse } from "../../../scraper/scrapeURL";
import { getScrapeQueue, redisConnection } from "../../../services/queue-service";
import type { Permutation } from "./doctor";
import { Job } from "bullmq";

const logger = _logger.child({ module: "doctorStatusController" });

const errorReplacer = (_, value) => {
    if (value instanceof Error) {
        return {
            ...value,
            name: value.name,
            message: value.message,
            stack: value.stack,
            cause: value.cause,
        }
    } else {
        return value;
    }
};

type PermutationResult = ({
    state: "done",
    result: ScrapeUrlResponse & {
        success: true
    },
} | {
    state: "thrownError",
    error: string | Error | null | undefined,
} | {
    state: "error",
    result: ScrapeUrlResponse & {
        success: false
    },
} | {
    state: "pending",
}) & {
    permutation: Permutation,
};

export async function doctorStatusController(req: Request, res: Response) {
  try {
    const doctorId = req.params.id;

    const meta: { url: string } | null = JSON.parse(await redisConnection.get("doctor:" + doctorId) ?? "null");
    const permutations: Permutation[] | null = JSON.parse(await redisConnection.get("doctor:" + doctorId + ":permutations") ?? "null");
    if (permutations === null || meta === null) {
        return res.status(404).json({ error: "Doctor entry not found" });
    }

    const jobs = (await Promise.all(permutations.map(x => getScrapeQueue().getJob(x.jobId)))).filter(x => x) as Job<unknown, ScrapeUrlResponse>[];

    const results: PermutationResult[] = await Promise.all(jobs.map(async job => {
        const permutation = permutations.find(x => x.jobId === job.id)!;
        const state = await job.getState();
        if (state === "completed" && job.data) {
            if (job.returnvalue.success) {
                return {
                    state: "done",
                    result: job.returnvalue,
                    permutation,
                }
            } else {
                return {
                    state: "error",
                    result: job.returnvalue,
                    permutation,
                }
            }
        } else if (state === "failed") {
            return {
                state: "thrownError",
                error: job.failedReason,
                permutation,
            }
        } else {
            return {
                state: "pending",
                permutation,
            }
        }
    }));

    const html = "<head><meta charset=\"utf8\"></head><body style=\"font-family: sans-serif; padding: 1rem;\"><h1>Doctor</h1><p>URL: <code>" + meta.url + "</code></p>"
        + results.map(x => "<h2>" + (x.state === "pending" ? "⏳" : x.state === "done" ? "✅" : "❌") + " " + x.permutation.name + "</h2><p>Scrape options: <code>" + JSON.stringify(x.permutation.options) + "</code></p>"
            + "<p>Internal options: <code>" + JSON.stringify(x.permutation.internal) + "</code></p>"
            + (x.state !== "pending" ? ("<code><pre>" + ((x.state === "done"
                ? JSON.stringify(x.result, errorReplacer, 4)
                : x.state === "thrownError"
                    ? (x.error instanceof Error
                        ? (x.error.message + "\n" + (x.error.stack ?? ""))
                        : (x.error ?? "<unknown error>")) 
                    : (JSON.stringify(x.result, errorReplacer, 4))))
                .replaceAll("<", "&lt;").replaceAll(">", "&gt;") + "</pre></code>"): "")).join("") 
        + "</body>"
    
    res.header("Content-Type", "text/html").send(html);
  } catch (error) {
    logger.error("Doctor status error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}
