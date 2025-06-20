import "dotenv/config";
import { supabase_service } from "../../../services/supabase";
import { removeJobFromGCS } from "../../../lib/gcs-jobs";
import { Request, Response } from "express";
import { logger as _logger } from "../../../lib/logger";
import type { Logger } from "winston";

async function cleanUpJob(jobId: string) {
    await removeJobFromGCS(jobId);
}

async function cleanUpTeam(teamId: string, _logger: Logger) {
    const logger = _logger.child({
        teamId,
        method: "cleanUpTeam",
    });

    logger.info(`Cleaning up team`, {
        teamId,
    });

    const cleanedUp: number[] = [];

    try {
        for (let i = 0; ; i++) {
            const { data: jobs } = await supabase_service.from("firecrawl_jobs")
                .select("id, job_id")
                .eq("team_id", teamId)
                .lte("date_added", new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString())
                .eq("zdr_cleaned_up", false)
                .range(i * 1000, (i + 1) * 1000)
                .throwOnError();
    
            if (jobs?.length === 0) {
                break;
            }
    
            await Promise.allSettled(jobs?.map(async (job) => {
                try {
                    await cleanUpJob(job.job_id);
                    cleanedUp.push(job.id);
                } catch (error) {
                    logger.error(`Error cleaning up job`, {
                        method: "cleanUpJob",
                        jobId: job.job_id,
                        scrapeId: job.job_id,
                        error,
                    });
                    throw error;
                }
            }) ?? []);
    
            if ((jobs ?? []).length < 1000) {
                break;
            }
        }
    } catch (error) {
        logger.error(`Error looping through jobs`, {
            error,
        });
    }

    if (cleanedUp.length > 0) {
        try {
            await supabase_service.from("firecrawl_jobs")
                .update({
                    zdr_cleaned_up: true,
                })
                .in("id", cleanedUp)
                .throwOnError();
        } catch (error) {
            logger.error(`Error setting cleanup value on team`, {
                error,
            });
        }
    }
}

export async function zdrcleanerController(req: Request, res: Response) {
    const logger = _logger.child({
        module: "zdrcleaner",
        method: "zdrcleanerController",
    });

    const { data: teams } = await supabase_service.from("teams")
        .select("id, name")
        .eq("flags->>zeroDataRetention", true)
        .throwOnError();

    for (const team of teams ?? []) {
        await cleanUpTeam(team.id, logger);
    }

    logger.info("ZDR Cleaner finished!");

    res.json({ ok: true })
}