import { CONCURRENCY_LIMIT } from "../services/rate-limiter";
import { redisConnection } from "../services/queue-service";
import { PlanType } from "../types";
import { JobsOptions } from "bullmq";

const constructKey = (team_id: string) => "concurrency-limiter:" + team_id;
const constructQueueKey = (team_id: string) =>
  "concurrency-limit-queue:" + team_id;
const stalledJobTimeoutMs = 2 * 60 * 1000;


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
  now: number = Date.now(),
) {
  await redisConnection.zadd(
    constructKey(team_id),
    now + stalledJobTimeoutMs,
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
  const res = await redisConnection.zmpop(1, constructQueueKey(team_id), "MIN");
  if (res === null || res === undefined) {
    return null;
  }

  return JSON.parse(res[1][0][0]);
}

export async function pushConcurrencyLimitedJob(
  team_id: string,
  job: ConcurrencyLimitedJob,
) {
  await redisConnection.zadd(
    constructQueueKey(team_id),
    job.priority ?? 1,
    JSON.stringify(job),
  );
}


export async function getConcurrencyQueueJobsCount(team_id: string): Promise<number> {
  const count = await redisConnection.zcard(constructQueueKey(team_id));
  return count;
}
