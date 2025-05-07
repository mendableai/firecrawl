import { redisConnection } from "../services/queue-service";
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
  await redisConnection.zremrangebyscore(constructKey(team_id), -Infinity, now);
}

export async function getConcurrencyLimitActiveJobs(
  team_id: string,
  now: number = Date.now(),
): Promise<string[]> {
  return await redisConnection.zrangebyscore(
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
  await redisConnection.zadd(
    constructKey(team_id),
    now + timeout,
    id,
  );
}

export async function removeConcurrencyLimitActiveJob(
  team_id: string,
  id: string,
) {
  await redisConnection.zrem(constructKey(team_id), id);
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
  await redisConnection.zremrangebyscore(constructQueueKey(team_id), -Infinity, Date.now());
  const res = await redisConnection.zmpop(1, constructQueueKey(team_id), "MIN");
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
  await redisConnection.zadd(
    constructQueueKey(team_id),
    Date.now() + timeout,
    JSON.stringify(job),
  );
}

export async function getConcurrencyLimitedJobs(
  team_id: string,
) {
  return new Set((await redisConnection.zrange(constructQueueKey(team_id), 0, -1)).map(x => JSON.parse(x).id));
}

export async function getConcurrencyQueueJobsCount(team_id: string): Promise<number> {
  const count = await redisConnection.zcard(constructQueueKey(team_id));
  return count;
}

export async function cleanOldCrawlConcurrencyLimitEntries(
  crawl_id: string,
  now: number = Date.now(),
) {
  await redisConnection.zremrangebyscore(constructCrawlKey(crawl_id), -Infinity, now);
}

export async function getCrawlConcurrencyLimitActiveJobs(
  crawl_id: string,
  now: number = Date.now(),
): Promise<string[]> {
  return await redisConnection.zrangebyscore(
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
  await redisConnection.zadd(
    constructCrawlKey(crawl_id),
    now + timeout,
    id,
  );
}

export async function removeCrawlConcurrencyLimitActiveJob(
  crawl_id: string,
  id: string,
) {
  await redisConnection.zrem(constructCrawlKey(crawl_id), id);
}

export async function takeCrawlConcurrencyLimitedJob(
  crawl_id: string,
): Promise<ConcurrencyLimitedJob | null> {
  const res = await redisConnection.zmpop(1, constructCrawlQueueKey(crawl_id), "MIN");
  if (res === null || res === undefined) {
    return null;
  }
  return JSON.parse(res[1][0][0]);
}

export async function pushCrawlConcurrencyLimitedJob(
  crawl_id: string,
  job: ConcurrencyLimitedJob,
) {
  await redisConnection.zadd(
    constructCrawlQueueKey(crawl_id),
    job.priority ?? 1,
    JSON.stringify(job),
  );
}

export async function getCrawlConcurrencyLimitedJobs(
  crawl_id: string,
) {
  return new Set((await redisConnection.zrange(constructCrawlQueueKey(crawl_id), 0, -1)).map(x => JSON.parse(x).id));
}

export async function getCrawlConcurrencyQueueJobsCount(crawl_id: string): Promise<number> {
  const count = await redisConnection.zcard(constructCrawlQueueKey(crawl_id));
  return count;
}
