import { parseApi } from "../../src/lib/parseApi";
import { getRateLimiter, crawlRateLimit, scrapeRateLimit } from "../../src/services/rate-limiter";
import { AuthResponse, RateLimiterMode } from "../../src/types";
import { supabase_service } from "../../src/services/supabase";
import { withAuth } from "../../src/lib/withAuth";
import { RateLimiterRedis } from "rate-limiter-flexible";

export async function authenticateUser(req, res, mode?: RateLimiterMode) : Promise<AuthResponse> {
  return withAuth(supaAuthenticateUser)(req, res, mode);
}

export async function supaAuthenticateUser(
  req,
  res,
  mode?: RateLimiterMode
): Promise<{
  success: boolean;
  team_id?: string;
  error?: string;
  status?: number;
}> {
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

  const incomingIP = (req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress) as string;
  const iptoken = incomingIP + token;

  let rateLimiter: RateLimiterRedis;
  let subscriptionData: { team_id: string, plan: string } | null = null;
  let normalizedApi: string;

  if (token == "this_is_just_a_preview_token") {
    rateLimiter = await getRateLimiter(RateLimiterMode.Preview, token);
  } else {    
    normalizedApi = parseApi(token);

    const { data, error } = await supabase_service.rpc(
      'get_key_and_price_id_2', { api_key: normalizedApi }
    );

    if (error) {
      console.error('Error fetching key and price_id:', error);
    } else {
      console.log('Key and Price ID:', data);
    }

    if (error || !data || data.length === 0) {
      return {
        success: false,
        error: "Unauthorized: Invalid token",
        status: 401,
      };
    }
    
    subscriptionData = {
      team_id: data[0].team_id,
      plan: getPlanByPriceId(data[0].price_id)
    }
    switch (mode) { 
      case RateLimiterMode.Crawl:
        rateLimiter = crawlRateLimit(subscriptionData.plan);
        break;
      case RateLimiterMode.Scrape:
        rateLimiter = scrapeRateLimit(subscriptionData.plan);
        break;
      // case RateLimiterMode.Search:
      //   rateLimiter = await searchRateLimiter(RateLimiterMode.Search, token);
      //   break;
    }
  }

  try {
    rateLimiter.consume(iptoken);
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
    (mode === RateLimiterMode.Scrape || mode === RateLimiterMode.Preview || mode === RateLimiterMode.Search)
  ) {
    return { success: true, team_id: "preview" };
    // check the origin of the request and make sure its from firecrawl.dev
    // const origin = req.headers.origin;
    // if (origin && origin.includes("firecrawl.dev")){
    //   return { success: true, team_id: "preview" };
    // }
    // if(process.env.ENV !== "production") {
    //   return { success: true, team_id: "preview" };
    // }

    // return { success: false, error: "Unauthorized: Invalid token", status: 401 };
  }

  // make sure api key is valid, based on the api_keys table in supabase
  if (!subscriptionData) {
    normalizedApi = parseApi(token);

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

    subscriptionData = data[0];
  }

  return { success: true, team_id: subscriptionData.team_id };  
}

function getPlanByPriceId(price_id: string) {
  switch (price_id) {
    case process.env.STRIPE_PRICE_ID_STANDARD:
      return 'standard';
    case process.env.STRIPE_PRICE_ID_SCALE:
      return 'scale';
    default:
      return 'starter';
  }
}