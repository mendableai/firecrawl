import { parseApi } from "../lib/parseApi";
import { getRateLimiter } from "../services/rate-limiter";
import {
  AuthResponse,
  NotificationType,
  PlanType,
  RateLimiterMode,
} from "../types";
import { supabase_service } from "../services/supabase";
import { withAuth } from "../lib/withAuth";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { Logger } from "../lib/logger";
import { getValue } from "../services/redis";
import { setValue } from "../services/redis";
import { validate } from "uuid";
import * as Sentry from "@sentry/node";
// const { data, error } = await supabase_service
//     .from('api_keys')
//     .select(`
//       key,
//       team_id,
//       teams (
//         subscriptions (
//           price_id
//         )
//       )
//     `)
//     .eq('key', normalizedApi)
//     .limit(1)
//     .single();
function normalizedApiIsUuid(potentialUuid: string): boolean {
  // Check if the string is a valid UUID
  return validate(potentialUuid);
}
export async function authenticateUser(
  req,
  res,
  mode?: RateLimiterMode
): Promise<AuthResponse> {
  return withAuth(supaAuthenticateUser)(req, res, mode);
}
function setTrace(team_id: string, api_key: string) {
  try {
    console.log("Setting trace attributes");
  } catch (error) {
    Sentry.captureException(error);
    Logger.error(`Error setting trace attributes: ${error.message}`);
  }
}

async function getKeyAndPriceId(normalizedApi: string): Promise<{
  success: boolean;
  teamId?: string;
  priceId?: string;
  error?: string;
  status?: number;
}> {
  const { data, error } = await supabase_service.rpc("get_key_and_price_id_2", {
    api_key: normalizedApi,
  });
  if (error) {
    Sentry.captureException(error);
    Logger.error(`RPC ERROR (get_key_and_price_id_2): ${error.message}`);
    return {
      success: false,
      error:
        "The server seems overloaded. Please contact hello@firecrawl.com if you aren't sending too many requests at once.",
      status: 500,
    };
  }
  if (!data || data.length === 0) {
    if (error) {
      Logger.warn(`Error fetching api key: ${error.message} or data is empty`);
      Sentry.captureException(error);
    }
    // TODO: change this error code ?
    return {
      success: false,
      error: "Unauthorized: Invalid token",
      status: 401,
    };
  } else {
    return {
      success: true,
      teamId: data[0].team_id,
      priceId: data[0].price_id,
    };
  }
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
  plan?: PlanType;
}> {

  const authHeader = req.headers.authorization ?? (req.headers["sec-websocket-protocol"] ? `Bearer ${req.headers["sec-websocket-protocol"]}` : null);
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
  let subscriptionData: { team_id: string; plan: string } | null = null;
  let normalizedApi: string;

  let cacheKey = "";
  let redLockKey = "";
  const lockTTL = 15000; // 10 seconds
  let teamId: string | null = null;
  let priceId: string | null = null;

  if (token == "this_is_just_a_preview_token") {
    if (mode == RateLimiterMode.CrawlStatus) {
      rateLimiter = getRateLimiter(RateLimiterMode.CrawlStatus, token);
    } else {
      rateLimiter = getRateLimiter(RateLimiterMode.Preview, token);
    }      
    teamId = "preview";
  } else {
    normalizedApi = parseApi(token);
    if (!normalizedApiIsUuid(normalizedApi)) {
      return {
        success: false,
        error: "Unauthorized: Invalid token",
        status: 401,
      };
    }

    cacheKey = `api_key:${normalizedApi}`;

    try {
      const teamIdPriceId = await getValue(cacheKey);
      if (teamIdPriceId) {
        const { team_id, price_id } = JSON.parse(teamIdPriceId);
        teamId = team_id;
        priceId = price_id;
      } else {
        const {
          success,
          teamId: tId,
          priceId: pId,
          error,
          status,
        } = await getKeyAndPriceId(normalizedApi);
        if (!success) {
          return { success, error, status };
        }
        teamId = tId;
        priceId = pId;
        await setValue(
          cacheKey,
          JSON.stringify({ team_id: teamId, price_id: priceId }),
          60
        );
      }
    } catch (error) {
      Sentry.captureException(error);
      Logger.error(`Error with auth function: ${error}`);
      // const {
      //   success,
      //   teamId: tId,
      //   priceId: pId,
      //   error: e,
      //   status,
      // } = await getKeyAndPriceId(normalizedApi);
      // if (!success) {
      //   return { success, error: e, status };
      // }
      // teamId = tId;
      // priceId = pId;
      // const {
      //   success,
      //   teamId: tId,
      //   priceId: pId,
      //   error: e,
      //   status,
      // } = await getKeyAndPriceId(normalizedApi);
      // if (!success) {
      //   return { success, error: e, status };
      // }
      // teamId = tId;
      // priceId = pId;
    }

    // get_key_and_price_id_2 rpc definition:
    // create or replace function get_key_and_price_id_2(api_key uuid)
    //   returns table(key uuid, team_id uuid, price_id text) as $$
    //   begin
    //     if api_key is null then
    //       return query
    //       select null::uuid as key, null::uuid as team_id, null::text as price_id;
    //     end if;

    //     return query
    //     select ak.key, ak.team_id, s.price_id
    //     from api_keys ak
    //     left join subscriptions s on ak.team_id = s.team_id
    //     where ak.key = api_key;
    //   end;
    //   $$ language plpgsql;

    const plan = getPlanByPriceId(priceId);
    // HyperDX Logging
    setTrace(teamId, normalizedApi);
    subscriptionData = {
      team_id: teamId,
      plan: plan,
    };
    switch (mode) {
      case RateLimiterMode.Crawl:
        rateLimiter = getRateLimiter(
          RateLimiterMode.Crawl,
          token,
          subscriptionData.plan
        );
        break;
      case RateLimiterMode.Scrape:
        rateLimiter = getRateLimiter(
          RateLimiterMode.Scrape,
          token,
          subscriptionData.plan,
          teamId
        );
        break;
      case RateLimiterMode.Search:
        rateLimiter = getRateLimiter(
          RateLimiterMode.Search,
          token,
          subscriptionData.plan
        );
        break;
      case RateLimiterMode.Map:
        rateLimiter = getRateLimiter(
          RateLimiterMode.Map,
          token,
          subscriptionData.plan
        );
        break;
      case RateLimiterMode.CrawlStatus:
        rateLimiter = getRateLimiter(RateLimiterMode.CrawlStatus, token);
        break;

      case RateLimiterMode.Preview:
        rateLimiter = getRateLimiter(RateLimiterMode.Preview, token);
        break;
      default:
        rateLimiter = getRateLimiter(RateLimiterMode.Crawl, token);
        break;
      // case RateLimiterMode.Search:
      //   rateLimiter = await searchRateLimiter(RateLimiterMode.Search, token);
      //   break;
    }
  }

  const team_endpoint_token =
    token === "this_is_just_a_preview_token" ? iptoken : teamId;

  try {
    await rateLimiter.consume(team_endpoint_token);
  } catch (rateLimiterRes) {
    Logger.error(`Rate limit exceeded: ${rateLimiterRes}`);
    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
    const retryDate = new Date(Date.now() + rateLimiterRes.msBeforeNext);

    // We can only send a rate limit email every 7 days, send notification already has the date in between checking
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    // await sendNotification(team_id, NotificationType.RATE_LIMIT_REACHED, startDate.toISOString(), endDate.toISOString());
    // Cache longer for 429s
    if (teamId && priceId && mode !== RateLimiterMode.Preview) {
      await setValue(
        cacheKey,
        JSON.stringify({ team_id: teamId, price_id: priceId }),
        60 // 10 seconds, cache for everything
      );
    }

    return {
      success: false,
      error: `Rate limit exceeded. Consumed (req/min): ${rateLimiterRes.consumedPoints}, Remaining (req/min): ${rateLimiterRes.remainingPoints}. Upgrade your plan at https://firecrawl.dev/pricing for increased rate limits or please retry after ${secs}s, resets at ${retryDate}`,
      status: 429,
    };
  }

  if (
    token === "this_is_just_a_preview_token" &&
    (mode === RateLimiterMode.Scrape ||
      mode === RateLimiterMode.Preview ||
      mode === RateLimiterMode.Map ||
      mode === RateLimiterMode.Crawl ||
      mode === RateLimiterMode.CrawlStatus ||
      mode === RateLimiterMode.Search)
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
      if (error) {
        Sentry.captureException(error);
        Logger.warn(`Error fetching api key: ${error.message} or data is empty`);
      }
      return {
        success: false,
        error: "Unauthorized: Invalid token",
        status: 401,
      };
    }

    subscriptionData = data[0];
  }

  return {
    success: true,
    team_id: subscriptionData.team_id,
    plan: (subscriptionData.plan ?? "") as PlanType,
  };
}
function getPlanByPriceId(price_id: string): PlanType {
  switch (price_id) {
    case process.env.STRIPE_PRICE_ID_STARTER:
      return "starter";
    case process.env.STRIPE_PRICE_ID_STANDARD:
      return "standard";
    case process.env.STRIPE_PRICE_ID_SCALE:
      return "scale";
    case process.env.STRIPE_PRICE_ID_HOBBY:
    case process.env.STRIPE_PRICE_ID_HOBBY_YEARLY:
      return "hobby";
    case process.env.STRIPE_PRICE_ID_STANDARD_NEW:
    case process.env.STRIPE_PRICE_ID_STANDARD_NEW_YEARLY:
      return "standardnew";
    case process.env.STRIPE_PRICE_ID_GROWTH:
    case process.env.STRIPE_PRICE_ID_GROWTH_YEARLY:
      return "growth";
    case process.env.STRIPE_PRICE_ID_GROWTH_DOUBLE_MONTHLY:
      return "growthdouble";
    default:
      return "free";
  }
}
