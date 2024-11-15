import { Request, Response } from "express";
import { logger as _logger } from "../../../lib/logger";
import { ScrapeUrlResponse, InternalOptions } from "../../../scraper/scrapeURL";
import { z } from "zod";
import { scrapeOptions } from "../types";
import { Engine, engineOptions, engines } from "../../../scraper/scrapeURL/engines";
import { addScrapeJob, addScrapeJobs } from "../../../services/queue-jobs";
import { redisConnection } from "../../../services/queue-service";

const logger = _logger.child({ module: "doctorController" });

export type Permutation = {
    options: z.input<typeof scrapeOptions>,
    internal: InternalOptions,
    name: string,
    jobId: string,
};

export async function doctorController(req: Request, res: Response) {
  try {
    const doctorId = crypto.randomUUID();

    const permutations: Permutation[] = [
        { options: {}, internal: { verbose: true }, name: "bare", jobId: crypto.randomUUID() },
        ...Object.entries(engineOptions).filter(([name, options]) => options.quality > 0 && engines.includes(name as Engine)).map(([name, _options]) => ({
            options: {}, internal: { forceEngine: name as Engine, verbose: true }, name, jobId: crypto.randomUUID(),
        })),
    ];

    await addScrapeJobs(permutations.map(perm => ({
        data: {
            url: req.body.url,
            mode: "single_urls",
            team_id: null,
            scrapeOptions: scrapeOptions.parse(perm.options),
            internalOptions: perm.internal,
            plan: null,
            origin: "doctor",
            is_scrape: true,
            doctor: true,
        },
        opts: {
            jobId: perm.jobId,
            priority: 10,
        },
    })));

    await redisConnection.set("doctor:" + doctorId, JSON.stringify({ url: req.body.url }), "EX", 86400);
    await redisConnection.set("doctor:" + doctorId + ":permutations", JSON.stringify(permutations), "EX", 86400);
    
    const protocol = process.env.ENV === "local" ? req.protocol : "https";

    res.json({ ok: true, id: doctorId, url: `${protocol}://${req.get("host")}/admin/${process.env.BULL_AUTH_KEY}/doctor/${doctorId}` });

    // await Promise.all(permutations.map(async perm => {
        // try {
        //     const result = await scrapeURL(doctorId + ":bare", url, scrapeOptions.parse(perm.options), perm.internal);
        //     if (result.success) { 
        //         results.push({
        //             state: "done",
        //             result,
        //             permutation: perm,
        //         });
        //     } else {
        //         results.push({
        //             state: "error",
        //             result,
        //             permutation: perm,
        //         });
        //     }
        // } catch (error) {
        //     console.error("Permutation " + perm.name + " failed with error", { error });
        //     results.push({
        //         state: "thrownError",
        //         error,
        //         permutation: perm,
        //     });
        // }
    // }));
  } catch (error) {
    logger.error("Doctor error", { error });
    res.status(500).json({ error: "Internal server error" });
  }
}
