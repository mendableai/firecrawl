import z from "zod";
import { logger } from "../../lib/logger";
import { Client, Pool } from "pg";

// === Basics

const nuqPool = new Pool({
    connectionString: process.env.NUQ_DATABASE_URL,
});

nuqPool.on("error", (err) => {
    logger.error("Error in NuQ idle client", { err, module: "nuq" });
});

export type NuQJob<T> = {
    id: string;
    createdAt: Date;
    data: T;
}

// === Listener

let nuqListener: Client | null = null;
let nuqListens: { [key: string]: ((status: "completed" | "failed") => void)[] } = {};

async function nuqStartListener() {
    if (nuqListener) {
        return;
    }

    nuqListener = new Client({
        connectionString: process.env.NUQ_DATABASE_URL_LISTEN ?? process.env.NUQ_DATABASE_URL,
    });
    await nuqListener.connect();
    await nuqListener.query("LISTEN \"nuq.queue_scrape\";");

    nuqListener.on("notification", (msg) => {
        const tok = (msg.payload ?? "unknown|unknown").split("|");
        if (tok[0] in nuqListens) {
            for (const listener of nuqListens[tok[0]]) {
                listener(tok[1] as "completed" | "failed");
            }
            delete nuqListens[tok[0]];
        }
    });

    nuqListener.on("error", (err) => {
        logger.error("Error in NuQ listener", { err, module: "nuq" });
    });

    nuqListener.on("end", () => {
        logger.info("NuQ listener disconnected");
        nuqListener = null;
    });
}

async function nuqAddListener(id: string, listener: (status: "completed" | "failed") => void) {
    await nuqStartListener();

    if (!(id in nuqListens)) {
        nuqListens[id] = [listener];
    } else {
        nuqListens[id].push(listener);
    }
}

async function nuqRemoveListener(id: string, listener: (status: "completed" | "failed") => void) {
    await nuqStartListener();
    if (id in nuqListens) {
        nuqListens[id] = nuqListens[id].filter(l => l !== listener);
        if (nuqListens[id].length === 0) {
            delete nuqListens[id];
        }
    }
}

// === Producer

export async function nuqAddJob<T>(id: string, data: T): Promise<NuQJob<T>> {
    const start = Date.now();
    const client = await nuqPool.connect();
    try {
        const result = await client.query(`INSERT INTO nuq.queue_scrape (id, data) VALUES ($1, $2) RETURNING *;`, [id, data]);
        return {
            id: result.rows[0].id,
            createdAt: result.rows[0].created_at,
            data: result.rows[0].data,
        }
    } finally {
        await client.release();
        const end = Date.now();
        logger.info("nuqAddJob metrics", { module: "nuq/metrics", method: "nuqAddJob", duration: end - start });
    }
}

export async function nuqWaitForJob(id: string, timeout: number | null): Promise<"completed" | "failed"> {
    try {
        z.string().uuid().parse(id);
    } catch (e) {
        throw new Error("Invalid job ID");
    }

    const done = new Promise<"completed" | "failed">(async (resolve, reject) => {
        const listener = (msg: "completed" | "failed") => {
            resolve(msg);
        }

        try {
            await nuqAddListener(id, listener);
        } catch (e) {
            reject(e);
        }

        if (timeout !== null) {
            setTimeout(() => {
                nuqRemoveListener(id, listener);
                reject(new Error("Timed out"));
            }, timeout);
        }
    });

    return done;
}

// === Consumer

export async function nuqGetJobToProcess(lock: string): Promise<NuQJob<any> | null> {
    const start = Date.now();
    const client = await nuqPool.connect();
    try {
        await client.query("BEGIN");

        const result = await client.query("SELECT id, created_at, data FROM nuq.queue_scrape WHERE nuq.queue_scrape.status = 'queued'::nuq.job_status ORDER BY nuq.queue_scrape.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;");
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return null;
        }

        const job: NuQJob<any> = {
            id: result.rows[0].id,
            createdAt: result.rows[0].created_at,
            data: result.rows[0].data,
        };

        await client.query("UPDATE nuq.queue_scrape SET status = 'active'::nuq.job_status, lock = $1, locked_at = now() WHERE id = $2;", [lock, job.id]);
        await client.query("COMMIT");

        return job;
    } finally {
        await client.release();
        const end = Date.now();
        logger.info("nuqGetJobToProcess metrics", { module: "nuq/metrics", method: "nuqGetJobToProcess", duration: end - start });
    }
}

export async function nuqRenewLock(id: string, lock: string): Promise<boolean> {
    const start = Date.now();
    const result = await nuqPool.query("UPDATE nuq.queue_scrape SET locked_at = now() WHERE id = $1 AND lock = $2 AND status = 'active'::nuq.job_status;", [id, lock]);
    const end = Date.now();
    logger.info("nuqRenewLock metrics", { module: "nuq/metrics", method: "nuqRenewLock", duration: end - start });
    return result.rowCount !== 0;
}

export async function nuqJobEnd(id: string, lock: string, status: "completed" | "failed"): Promise<boolean> {
    const start = Date.now();
    try {
        const result = await nuqPool.query("UPDATE nuq.queue_scrape SET status = $1, lock = null, locked_at = null WHERE id = $2 AND lock = $3;", [status, id, lock]);
        if (result.rowCount === 0) {
            return false;
        } else {
            await nuqPool.query("SELECT pg_notify('nuq.queue_scrape', $1);", [`${id}|${status}`]);
            return true;
        }
    } finally {
        const end = Date.now();
        logger.info("nuqJobEnd metrics", { module: "nuq/metrics", method: "nuqJobEnd", duration: end - start });
    }
}

// === Metrics

export async function nuqGetMetrics(): Promise<string> {
    const start = Date.now();
    const result = await nuqPool.query("SELECT status, COUNT(id) as count FROM nuq.queue_scrape GROUP BY status ORDER BY count DESC;");
    const end = Date.now();
    logger.info("nuqGetMetrics metrics", { module: "nuq/metrics", method: "nuqGetMetrics", duration: end - start });
    return `# HELP nuq_queue_scrape_job_count Number of jobs in each status\n# TYPE nuq_queue_scrape_job_count gauge\n${result.rows.map(x => `nuq_queue_scrape_job_count{status="${x.status}"} ${x.count}`).join("\n")}`;
}

// === Cleanup

export async function nuqShutdown() {
    if (nuqListener) {
        const nl = nuqListener;
        nuqListener = null;
        await nl.query("UNLISTEN \"nuq.queue_scrape\";");
        await nl.end();
    }
    await nuqPool.end();
}

// === SQL

// CREATE SCHEMA nuq;
//
// CREATE TYPE nuq.job_status AS ENUM ('queued', 'active', 'completed', 'failed');
//
// CREATE TABLE nuq.queue_scrape (
//   id uuid NOT NULL DEFAULT gen_random_uuid(),
//   status USER-DEFINED NOT NULL DEFAULT 'queued'::nuq.job_status,
//   data jsonb,
//   created_at timestamp with time zone NOT NULL DEFAULT now(),
//   lock uuid,
//   locked_at timestamp with time zone,
//   CONSTRAINT queue_scrape_pkey PRIMARY KEY (id)
// );
// 
// CREATE INDEX queue_scrape_active_locked_at_idx ON nuq.queue_scrape USING btree (locked_at) WHERE (status = 'active'::nuq.job_status);
// CREATE INDEX nuq_queue_scrape_queued_created_at_idx ON nuq.queue_scrape USING btree (created_at) WHERE (status = 'queued'::nuq.job_status);
// CREATE INDEX nuq_queue_scrape_failed_created_at_idx ON nuq.queue_scrape USING btree (created_at) WHERE (status = 'failed'::nuq.job_status);
// CREATE INDEX nuq_queue_scrape_completed_created_at_idx ON nuq.queue_scrape USING btree (created_at) WHERE (status = 'completed'::nuq.job_status);
// 
// SELECT cron.schedule('nuq_queue_scrape_clean_completed', '*/5 * * * *', $$
//  DELETE FROM nuq.queue_scrape
//  WHERE nuq.queue_scrape.status = 'completed'::nuq.job_status
//  AND nuq.queue_scrape.created_at < now() - interval '1 hour';
// $$);
//
// SELECT cron.schedule('nuq_queue_scrape_clean_failed', '*/5 * * * *', $$
//  DELETE FROM nuq.queue_scrape
//  WHERE nuq.queue_scrape.status = 'failed'::nuq.job_status
//  AND nuq.queue_scrape.created_at < now() - interval '6 hours';
// $$);
//
// SELECT cron.schedule('nuq_queue_scrape_lock_reaper', '15 seconds', $$
//  UPDATE nuq.queue_scrape
//  SET status = 'queued', lock = null, locked_at = null
//  WHERE nuq.queue_scrape.locked_at <= now() - interval '1 minute'
//  AND nuq.queue_scrape.status = 'active'::nuq.job_status;
// $$);
