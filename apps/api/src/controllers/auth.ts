import { parseApi } from "../../src/lib/parseApi";
import { getRateLimiter } from "../../src/services/rate-limiter";
import { RateLimiterMode } from "../../src/types";
import { supabase_service } from "../../src/services/supabase";


export async function authenticateUser(
  req,
  res,
  mode?: RateLimiterMode
): Promise<{
  success: boolean;
  team_id?: string;
  error?: string;
  status?: number;
}> {

  console.log(process.env)

  if(process.env.USE_DB_AUTHENTICATION === "false"){
    console.log("WARNING - YOU'RE bypassing Authentication");
    return { success: true};
  }

  console.log("USING SUPABASE AUTH");

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return { success: false, error: "Unauthorized", status: 401 };
  }
  const token = authHeader.split(" ")[1]; // Extract the token from "Bearer <token>"
  if (!token) {
    return {
      success: false,
      error: "Unauthorized: Token missing",
      status: 401,
    };
  }

  try {
    const incomingIP = (req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress) as string;
    const iptoken = incomingIP + token;
    await getRateLimiter(
      token === "this_is_just_a_preview_token" ? RateLimiterMode.Preview : mode
    ).consume(iptoken);
  } catch (rateLimiterRes) {
    console.error(rateLimiterRes);
    return {
      success: false,
      error: "Rate limit exceeded. Too many requests, try again in 1 minute.",
      status: 429,
    };
  }

  if (
    token === "this_is_just_a_preview_token" &&
    (mode === RateLimiterMode.Scrape || mode === RateLimiterMode.Preview)
  ) {
    return { success: true, team_id: "preview" };
  }

  const normalizedApi = parseApi(token);
  // make sure api key is valid, based on the api_keys table in supabase
  const { data, error } = await supabase_service
    .from("api_keys")
    .select("*")
    .eq("key", normalizedApi);
  if (error || !data || data.length === 0) {
    return {
      success: false,
      error: "Unauthorized: Invalid token",
      status: 401,
    };
  }

  return { success: true, team_id: data[0].team_id };
}
