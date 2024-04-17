import { RateLimiterRedis } from "rate-limiter-flexible";
import * as redis from "redis";

const MAX_REQUESTS_PER_MINUTE_PREVIEW = 5;
const MAX_CRAWLS_PER_MINUTE_STARTER = 2;
const MAX_CRAWLS_PER_MINUTE_STANDARD = 4;
const MAX_CRAWLS_PER_MINUTE_SCALE = 20;

const MAX_REQUESTS_PER_MINUTE_ACCOUNT = 40;



export const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
  legacyMode: true,
});

export const previewRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: MAX_REQUESTS_PER_MINUTE_PREVIEW,
  duration: 60, // Duration in seconds
});

export const serverRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: MAX_REQUESTS_PER_MINUTE_ACCOUNT,
  duration: 60, // Duration in seconds
});


export function crawlRateLimit(plan: string){
  if(plan === "standard"){
    return new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "middleware",
      points: MAX_CRAWLS_PER_MINUTE_STANDARD,
      duration: 60, // Duration in seconds
    });
  }else if(plan === "scale"){
    return new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "middleware",
      points: MAX_CRAWLS_PER_MINUTE_SCALE,
      duration: 60, // Duration in seconds
    });
  }
  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "middleware",
    points: MAX_CRAWLS_PER_MINUTE_STARTER,
    duration: 60, // Duration in seconds
  });

}


export function getRateLimiter(preview: boolean){
  if(preview){
    return previewRateLimiter;
  }else{
    return serverRateLimiter;
  }
}
