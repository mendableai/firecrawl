import { supabase_service } from "./supabase";
import { WebsiteScrapeError } from "./types";

export async function logErrors(dataError: WebsiteScrapeError[], time_taken: number, num_tokens:number, score: number, num_pages_tested: number,) {
  try {
    await supabase_service.from("test_suite_logs").insert([{log:dataError, time_taken, num_tokens, score, num_pages_tested, is_error: dataError.length > 0}]);
  } catch (error) {
    console.error(`Error logging to supabase: ${error}`);
  }
}
