import { eq, InferSelectModel, sql } from "drizzle-orm";
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

// NOTE: why is this an RPC??
export const supabaseGetJobsById = async (jobIds: string[]) => {
  let data: { job_id: string, docs: unknown }[];
  try {
    data = await db.execute(sql`SELECT job_id, docs FROM get_jobs_by_ids(${jobIds})`);
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
