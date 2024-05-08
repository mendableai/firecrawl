import { supabase_service } from "./supabase";
import { WebsiteScrapeError } from "./types";

export async function logErrors(dataError: WebsiteScrapeError[], time_taken: number, num_tokens:number, score: number) {
  try {
    await supabase_service.from("test_suite_logs").insert([{log:dataError, time_taken, num_tokens, score}]);
  } catch (error) {
    console.error(`Error logging to supabase: ${error}`);
  }
}
