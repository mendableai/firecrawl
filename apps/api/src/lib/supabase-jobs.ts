import { eq, inArray } from "drizzle-orm";
import db from "../services/db";
import { firecrawlJobs } from "../services/db/schema";
import { Logger } from "./logger";
import * as Sentry from "@sentry/node";

export const supabaseGetJobById = async (jobId: string) => {
  try {
    const data = await db
      .select()
      .from(firecrawlJobs)
      .where(eq(firecrawlJobs.jobId, jobId))
      .limit(1);
    
    return data[0] ?? null;
  } catch (_) {
    return null;
  }
};

export const supabaseGetJobsById = async (jobIds: string[]) => {
  let data: { jobId: string, docs: unknown }[];
  try {
    data = await db.select().from(firecrawlJobs).where(inArray(firecrawlJobs.jobId, jobIds));
  } catch (error) {
    Logger.error(`Error in get_jobs_by_ids: ${error}`);
    Sentry.captureException(error);
    return [];
  }

  if (!data) {
    return [];
  }

  return data;
};
