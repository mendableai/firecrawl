import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { configDotenv } from "dotenv";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import { redisEvictConnection } from "./redis";
configDotenv();

// SupabaseService class initializes the Supabase client conditionally based on environment variables.
class IndexSupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    const supabaseUrl = process.env.INDEX_SUPABASE_URL;
    const supabaseServiceToken = process.env.INDEX_SUPABASE_SERVICE_TOKEN;
    // Only initialize the Supabase client if both URL and Service Token are provided.
    if (!supabaseUrl || !supabaseServiceToken) {
      // Warn the user that Authentication is disabled by setting the client to null
      logger.warn(
        "Index supabase client will not be initialized.",
      );
      this.client = null;
    } else {
      this.client = createClient(supabaseUrl, supabaseServiceToken);
    }
  }

  // Provides access to the initialized Supabase client, if available.
  getClient(): SupabaseClient | null {
    return this.client;
  }
}

const serv = new IndexSupabaseService();

// Using a Proxy to handle dynamic access to the Supabase client or service methods.
// This approach ensures that if Supabase is not configured, any attempt to use it will result in a clear error.
export const index_supabase_service: SupabaseClient = new Proxy(
  serv,
  {
    get: function (target, prop, receiver) {
      const client = target.getClient();
      // If the Supabase client is not initialized, intercept property access to provide meaningful error feedback.
      if (client === null) {
        return () => {
          throw new Error("Index supabase client is not configured.");
        };
      }
      // Direct access to SupabaseService properties takes precedence.
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      // Otherwise, delegate access to the Supabase client.
      return Reflect.get(client, prop, receiver);
    },
  },
) as unknown as SupabaseClient;

const credentials = process.env.GCS_CREDENTIALS ? JSON.parse(atob(process.env.GCS_CREDENTIALS)) : undefined;

export async function getIndexFromGCS(url: string): Promise<any | null> {
    //   logger.info(`Getting f-engine document from GCS`, {
    //     url,
    //   });
    try {
        if (!process.env.GCS_INDEX_BUCKET_NAME) {
            return null;
        }

        const storage = new Storage({ credentials });
        const bucket = storage.bucket(process.env.GCS_INDEX_BUCKET_NAME);
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


export async function saveIndexToGCS(id: string, doc: {
  url: string;
  html: string;
  statusCode: number;
  error?: string;
  screenshot?: string;
  numPages?: number;
}): Promise<void> {
  try {
      if (!process.env.GCS_INDEX_BUCKET_NAME) {
          return;
      }

      const storage = new Storage({ credentials });
      const bucket = storage.bucket(process.env.GCS_INDEX_BUCKET_NAME);
      const blob = bucket.file(`${id}.json`);
      for (let i = 0; i < 3; i++) {
          try {
              await blob.save(JSON.stringify(doc), { 
                  contentType: "application/json",
              });
              break;
          } catch (error) {
              if (i === 2) {
                  throw error;
              } else {
                  logger.error(`Error saving index document to GCS, retrying`, {
                      error,
                      indexId: id,
                      i,
                  });
              }
          }
      }
  } catch (error) {
    throw new Error("Error saving index document to GCS", {
      cause: error,
    });
  }
}

export const useIndex =
    process.env.INDEX_SUPABASE_URL !== "" &&
    process.env.INDEX_SUPABASE_URL !== undefined;

export function normalizeURLForIndex(url: string): string {
    const urlObj = new URL(url);
    urlObj.hash = "";
    urlObj.protocol = "https";

    if (urlObj.port === "80" || urlObj.port === "443") {
        urlObj.port = "";
    }

    if (urlObj.hostname.startsWith("www.")) {
        urlObj.hostname = urlObj.hostname.slice(4);
    }

    if (urlObj.pathname.endsWith("/index.html")) {
        urlObj.pathname = urlObj.pathname.slice(0, -10);
    } else if (urlObj.pathname.endsWith("/index.php")) {
        urlObj.pathname = urlObj.pathname.slice(0, -9);
    } else if (urlObj.pathname.endsWith("/index.htm")) {
        urlObj.pathname = urlObj.pathname.slice(0, -9);
    } else if (urlObj.pathname.endsWith("/index.shtml")) {
        urlObj.pathname = urlObj.pathname.slice(0, -11);
    } else if (urlObj.pathname.endsWith("/index.xml")) {
        urlObj.pathname = urlObj.pathname.slice(0, -9);
    }

    if (urlObj.pathname.endsWith("/")) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
    }

    return urlObj.toString();
}

export async function hashURL(url: string): Promise<string> {
    return "\\x" + crypto.createHash("sha256").update(url).digest("hex");
}

export function generateURLSplits(url: string): string[] {
  const urls: string[] = [];
  const urlObj = new URL(url);
  urlObj.hash = "";
  urlObj.search = "";
  const pathnameParts = urlObj.pathname.split("/");

  for (let i = 0; i <= pathnameParts.length; i++) {
      urlObj.pathname = pathnameParts.slice(0, i).join("/");
      urls.push(urlObj.href);
  }

  urls.push(url);

  return [...new Set(urls.map(x => normalizeURLForIndex(x)))];
}

const INDEX_INSERT_QUEUE_KEY = "index-insert-queue";
const INDEX_INSERT_BATCH_SIZE = 1000;

export async function addIndexInsertJob(data: any) {
  await redisEvictConnection.rpush(INDEX_INSERT_QUEUE_KEY, JSON.stringify(data));
}

export async function getIndexInsertJobs(): Promise<any[]> {
  const jobs = (await redisEvictConnection.lpop(INDEX_INSERT_QUEUE_KEY, INDEX_INSERT_BATCH_SIZE)) ?? [];
  return jobs.map(x => JSON.parse(x));
}

export async function processIndexInsertJobs() {
  const jobs = await getIndexInsertJobs();
  if (jobs.length === 0) {
    return;
  }
  logger.info(`Index inserter found jobs to insert`, { jobCount: jobs.length });
  try {
    await index_supabase_service.from("index").insert(jobs);
    logger.info(`Index inserter inserted jobs`, { jobCount: jobs.length });
  } catch (error) {
    logger.error(`Index inserter failed to insert jobs`, { error, jobCount: jobs.length });
  }
}

export async function getIndexInsertQueueLength(): Promise<number> {
  return await redisEvictConnection.llen(INDEX_INSERT_QUEUE_KEY) ?? 0;
}
