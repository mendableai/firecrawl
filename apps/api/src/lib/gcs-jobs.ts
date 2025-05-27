import { FirecrawlJob } from "../types";
import { Storage } from "@google-cloud/storage";
import { logger } from "./logger";
import { Document } from "../controllers/v1/types";

const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(atob(process.env.GCS_CREDENTIALS)) : undefined;

export async function saveJobToGCS(job: FirecrawlJob): Promise<void> {
    try {
        if (!process.env.GCS_BUCKET_NAME) {
            return;
        }

        const storage = new Storage({ credentials });
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const blob = bucket.file(`${job.job_id}.json`);
        for (let i = 0; i < 3; i++) {
            try {
                await blob.save(JSON.stringify(job.docs), { 
                    contentType: "application/json",
                });
                break;
            } catch (error) {
                if (i === 2) {
                    throw error;
                } else {
                    logger.error(`Error saving job to GCS, retrying`, {
                        error,
                        scrapeId: job.job_id,
                        jobId: job.job_id,
                        i,
                    });
                }
            }
        }
        for (let i = 0; i < 3; i++) {
            try {
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
                        crawler_options: JSON.stringify(job.crawlerOptions),
                        page_options: JSON.stringify(job.scrapeOptions),
                        origin: job.origin,
                        num_tokens: job.num_tokens ?? null,
                        retry: !!job.retry,
                        crawl_id: job.crawl_id ?? null,
                        tokens_billed: job.tokens_billed ?? null,
                    },
                });
                break;
            } catch (error) {
                if (i === 2) {
                    throw error;
                } else {
                    logger.error(`Error saving job metadata to GCS, retrying`, {
                        error,
                        scrapeId: job.job_id,
                        jobId: job.job_id,
                        i,
                    });
                }
            }
        }
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

// TODO: fix the any type (we have multiple Document types in the codebase)
export async function getDocFromGCS(url: string): Promise<any | null> {
//   logger.info(`Getting f-engine document from GCS`, {
//     url,
//   });
  try {
      if (!process.env.GCS_FIRE_ENGINE_BUCKET_NAME) {
          return null;
      }

      const storage = new Storage({ credentials });
      const bucket = storage.bucket(process.env.GCS_FIRE_ENGINE_BUCKET_NAME);
      const blob = bucket.file(`${url}`);
      const [exists] = await blob.exists();
      if (!exists) {
          return null;
      }
      const [blobContent] = await blob.download();
      const parsed = JSON.parse(blobContent.toString());
      return parsed;
  } catch (error) {
      logger.error(`Error getting f-engine document from GCS`, {
          error,
          url,
      });
      return null;
  }
}