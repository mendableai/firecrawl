import { supabase_service } from "../services/supabase";
import { Logger } from "./logger";
import * as Sentry from "@sentry/node";

export const supabaseGetJobById = async (jobId: string) => {
  const { data, error } = await supabase_service
    .from("firecrawl_jobs")
    .select("*")
    .eq("job_id", jobId)
    .single();

  if (error) {
    return null;
  }

  if (!data) {
    return null;
  }

  return data;
};

export const supabaseGetJobsById = async (jobIds: string[]) => {
  const { data, error } = await supabase_service.rpc("get_jobs_by_ids", {
    job_ids: jobIds,
  });

  if (error) {
    Logger.error(`Error in get_jobs_by_ids: ${error}`);
    Sentry.captureException(error);
    return [];
  }

  if (!data) {
    return [];
  }

  return data;
};


export const supabaseGetJobByIdOnlyData = async (jobId: string) => {
  const { data, error } = await supabase_service
    .from("firecrawl_jobs")
    .select("docs, team_id")
    .eq("job_id", jobId)
    .single();

  if (error) {
    return null;
  }

  if (!data) {
    return null;
  }

  return data;
};