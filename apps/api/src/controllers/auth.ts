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
import { setTraceAttributes } from "@hyperdx/node-opentelemetry";
import { sendNotification } from "../services/notification/email_notification";
import { Logger } from "../lib/logger";
import { redlock } from "../services/redlock";
import { getValue } from "../services/redis";
import { setValue } from "../services/redis";
import { validate } from "uuid";
import * as Sentry from "@sentry/node";
import { AuthCreditUsageChunk } from "./v1/types";
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

export async function setCachedACUC(api_key: string, acuc: AuthCreditUsageChunk | ((acuc: AuthCreditUsageChunk) => AuthCreditUsageChunk)) { 
  const cacheKeyACUC = `acuc_${api_key}`;
  const redLockKey = `lock_${cacheKeyACUC}`;

  try {
    await redlock.using([redLockKey], 10000, {}, async signal => {
      if (typeof acuc === "function") {
        acuc = acuc(JSON.parse(await getValue(cacheKeyACUC)));

        if (acuc === null) {
          if (signal.aborted) {
            throw signal.error;
          }

          return;
        }
      }

      if (signal.aborted) {
        throw signal.error;
      }

      // Cache for 10 minutes. This means that changing subscription tier could have
      // a maximum of 10 minutes of a delay. - mogery
      await setValue(cacheKeyACUC, JSON.stringify(acuc), 600, true);
    });
  } catch (error) {
    Logger.error(`Error updating cached ACUC ${cacheKeyACUC}: ${error}`);
  }
}

export async function getACUC(api_key: string, cacheOnly = false): Promise<AuthCreditUsageChunk | null> {
  const cacheKeyACUC = `acuc_${api_key}`;

  const cachedACUC = await getValue(cacheKeyACUC);

  if (cachedACUC !== null) {
    return JSON.parse(cachedACUC);
  } else if (!cacheOnly) {
    const { data, error } =
      await supabase_service.rpc("auth_credit_usage_chunk", { input_key: api_key });
    
    if (error) {
      throw new Error("Failed to retrieve authentication and credit usage data: " + JSON.stringify(error));
    }

    const chunk: AuthCreditUsageChunk | null = data.length === 0
      ? null
      : data[0].team_id === null
      ? null
      : data[0];

    // NOTE: Should we cache null chunks? - mogery
    if (chunk !== null) {
      setCachedACUC(api_key, chunk);
    }

    return chunk;
  } else {
    return null;
  }
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
    setTraceAttributes({
      team_id,
      api_key,
    });
  } catch (error) {
    Sentry.captureException(error);
    Logger.error(`Error setting trace attributes: ${error.message}`);
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
  chunk?: AuthCreditUsageChunk;
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

  let teamId: string | null = null;
  let priceId: string | null = null;
  let chunk: AuthCreditUsageChunk;

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

    chunk = await getACUC(normalizedApi);

    if (chunk === null) {
      return {
        success: false,
        error: "Unauthorized: Invalid token",
        status: 401,
      };
    }

    teamId = chunk.team_id;
    priceId = chunk.price_id;

    const plan = getPlanByPriceId(priceId);
    // HyperDX Logging
    setTrace(teamId, normalizedApi);
    subscriptionData = {
      team_id: teamId,
      plan,
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

  return {
    success: true,
    team_id: subscriptionData.team_id,
    plan: (subscriptionData.plan ?? "") as PlanType,
    chunk,
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
