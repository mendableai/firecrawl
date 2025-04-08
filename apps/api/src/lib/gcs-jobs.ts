import { FirecrawlJob } from "../types";
import { Storage } from "@google-cloud/storage";
import { logger } from "./logger";

const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(atob(process.env.GCS_CREDENTIALS)) : undefined;

export async function saveJobToGCS(job: FirecrawlJob): Promise<void> {
    try {
        if (!process.env.GCS_BUCKET_NAME) {
            return;
        }

        const storage = new Storage({ credentials });
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const blob = bucket.file(`${job.job_id}.json`);
        await blob.save(JSON.stringify(job.docs), {
            contentType: "application/json",
        });
        await blob.setMetadata({
            metadata: {
                job_id: job.job_id ?? null,
                success: job.success,
                message: job.message ?? null,
                num_docs: job.num_docs,
                time_taken: job.time_taken,
                team_id: (job.team_id === "preview" || job.team_id?.startsWith("preview_")) ? null : job.team_id,
                mode: job.mode,
                url: job.url,
                crawler_options: job.crawlerOptions,
                page_options: job.scrapeOptions,
                origin: job.origin,
                num_tokens: job.num_tokens ?? null,
                retry: !!job.retry,
                crawl_id: job.crawl_id ?? null,
                tokens_billed: job.tokens_billed ?? null,
            },
        })
    } catch (error) {
        logger.error(`Error saving job to GCS`, {
            error,
            scrapeId: job.job_id,
            jobId: job.job_id,
        });
    }
}

export async function getJobFromGCS(jobId: string): Promise<Document[] | null> {
    try {
        if (!process.env.GCS_BUCKET_NAME) {
            return null;
        }

        const storage = new Storage({ credentials });
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const blob = bucket.file(`${jobId}.json`);
        const [exists] = await blob.exists();
        if (!exists) {
            return null;
        }
        const [content] = await blob.download();
        const x = JSON.parse(content.toString());
        console.log("Downloaded file ", jobId, x);
        return x;
    } catch (error) {
        logger.error(`Error getting job from GCS`, {
            error,
            jobId,
            scrapeId: jobId,
        });
        return null;
    }
}