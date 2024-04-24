import { RateLimiterRedis } from "rate-limiter-flexible";
import * as redis from "redis";
import { RateLimiterMode } from "../../src/types";

const MAX_REQUESTS_PER_MINUTE_PREVIEW = 5;
const MAX_CRAWLS_PER_MINUTE_STARTER = 2;
const MAX_CRAWLS_PER_MINUTE_STANDARD = 4;
const MAX_CRAWLS_PER_MINUTE_SCALE = 20;

const MAX_REQUESTS_PER_MINUTE_ACCOUNT = 20;

const MAX_REQUESTS_PER_MINUTE_CRAWL_STATUS = 120;




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

export const crawlStatusRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: MAX_REQUESTS_PER_MINUTE_CRAWL_STATUS,
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




export function getRateLimiter(mode: RateLimiterMode){
  switch(mode) {
    case RateLimiterMode.Preview:
      return previewRateLimiter;
    case RateLimiterMode.CrawlStatus:
      return crawlStatusRateLimiter;
    default:
      return serverRateLimiter;
  }
}
