import { redisEvictConnection } from "../services/redis";
import type { JobsOptions } from "bullmq";

const constructKey = (team_id: string) => "concurrency-limiter:" + team_id;
const constructQueueKey = (team_id: string) =>
  "concurrency-limit-queue:" + team_id;

const constructCrawlKey = (crawl_id: string) => "crawl-concurrency-limiter:" + crawl_id;
const constructCrawlQueueKey = (crawl_id: string) => "crawl-concurrency-limit-queue:" + crawl_id;

export async function cleanOldConcurrencyLimitEntries(
  team_id: string,
  now: number = Date.now(),
) {
  await redisEvictConnection.zremrangebyscore(constructKey(team_id), -Infinity, now);
}

export async function getConcurrencyLimitActiveJobs(
  team_id: string,
  now: number = Date.now(),
): Promise<string[]> {
  return await redisEvictConnection.zrangebyscore(
    constructKey(team_id),
    now,
    Infinity,
  );
}

export async function pushConcurrencyLimitActiveJob(
  team_id: string,
  id: string,
  timeout: number,
  now: number = Date.now(),
) {
  await redisEvictConnection.zadd(
    constructKey(team_id),
    now + timeout,
    id,
  );
}

export async function removeConcurrencyLimitActiveJob(
  team_id: string,
  id: string,
) {
  await redisEvictConnection.zrem(constructKey(team_id), id);
}

export type ConcurrencyLimitedJob = {
  id: string;
  data: any;
  opts: JobsOptions;
  priority?: number;
};

export async function takeConcurrencyLimitedJob(
  team_id: string,
): Promise<ConcurrencyLimitedJob | null> {
  await redisEvictConnection.zremrangebyscore(constructQueueKey(team_id), -Infinity, Date.now());
  const res = await redisEvictConnection.zmpop(1, constructQueueKey(team_id), "MIN");
  if (res === null || res === undefined) {
    return null;
  }

  return JSON.parse(res[1][0][0]);
}

export async function pushConcurrencyLimitedJob(
  team_id: string,
  job: ConcurrencyLimitedJob,
  timeout: number,
) {
  await redisEvictConnection.zadd(
    constructQueueKey(team_id),
    Date.now() + timeout,
    JSON.stringify(job),
  );
}

export async function getConcurrencyLimitedJobs(
  team_id: string,
) {
  return new Set((await redisEvictConnection.zrange(constructQueueKey(team_id), 0, -1)).map(x => JSON.parse(x).id));
}

export async function getConcurrencyQueueJobsCount(team_id: string): Promise<number> {
  const count = await redisEvictConnection.zcard(constructQueueKey(team_id));
  return count;
}

export async function cleanOldCrawlConcurrencyLimitEntries(
  crawl_id: string,
  now: number = Date.now(),
) {
  await redisEvictConnection.zremrangebyscore(constructCrawlKey(crawl_id), -Infinity, now);
}

export async function getCrawlConcurrencyLimitActiveJobs(
  crawl_id: string,
  now: number = Date.now(),
): Promise<string[]> {
  return await redisEvictConnection.zrangebyscore(
    constructCrawlKey(crawl_id),
    now,
    Infinity,
  );
}

export async function pushCrawlConcurrencyLimitActiveJob(
  crawl_id: string,
  id: string,
  timeout: number,
  now: number = Date.now(),
) {
  await redisEvictConnection.zadd(
    constructCrawlKey(crawl_id),
    now + timeout,
    id,
  );
}

export async function removeCrawlConcurrencyLimitActiveJob(
  crawl_id: string,
  id: string,
) {
  await redisEvictConnection.zrem(constructCrawlKey(crawl_id), id);
}

export async function takeCrawlConcurrencyLimitedJob(
  crawl_id: string,
): Promise<ConcurrencyLimitedJob | null> {
  const res = await redisEvictConnection.zmpop(1, constructCrawlQueueKey(crawl_id), "MIN");
  if (res === null || res === undefined) {
    return null;
  }
  return JSON.parse(res[1][0][0]);
}

export async function pushCrawlConcurrencyLimitedJob(
  crawl_id: string,
  job: ConcurrencyLimitedJob,
) {
  await redisEvictConnection.zadd(
    constructCrawlQueueKey(crawl_id),
    job.priority ?? 1,
    JSON.stringify(job),
  );
}

export async function getCrawlConcurrencyLimitedJobs(
  crawl_id: string,
) {
  return new Set((await redisEvictConnection.zrange(constructCrawlQueueKey(crawl_id), 0, -1)).map(x => JSON.parse(x).id));
}

export async function getCrawlConcurrencyQueueJobsCount(crawl_id: string): Promise<number> {
  const count = await redisEvictConnection.zcard(constructCrawlQueueKey(crawl_id));
  return count;
}
