import { createClient } from "@supabase/supabase-js";

export const supabase_service = createClient<any>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_TOKEN,
);
