import { logger } from "../../lib/logger";
import { Client, Pool } from "pg";

// === Basics

const nuqPool = new Pool({
    connectionString: process.env.NUQ_DATABASE_URL,
    application_name: "nuq",
});

nuqPool.on("error", (err) => {
    logger.error("Error in NuQ idle client", { err, module: "nuq" });
});

export type NuQJobStatus = "queued" | "active" | "completed" | "failed";
export type NuQJob<T> = {
    id: string;
    status: NuQJobStatus;
    createdAt: Date;
    data: T;
};

// === Listener

let nuqListener: Client | null = null;
let nuqListens: { [key: string]: ((status: "completed" | "failed") => void)[] } = {};

async function nuqStartListener() {
    if (nuqListener) {
        return;
    }

    nuqListener = new Client({
        connectionString: process.env.NUQ_DATABASE_URL_LISTEN ?? process.env.NUQ_DATABASE_URL,
        application_name: "nuq_listener",
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
        setTimeout(() => {
            nuqStartListener().catch(err => logger.error("Error in NuQ listener reconnect", { err, module: "nuq" }));
        }, 250);
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
    if (id in nuqListens) {
        nuqListens[id] = nuqListens[id].filter(l => l !== listener);
        if (nuqListens[id].length === 0) {
            delete nuqListens[id];
        }
    }
}

// === Job fetching

function rowToJob<T>(row: any): NuQJob<T> {
    return {
        id: row.id,
        status: row.status,
        createdAt: new Date(row.created_at),
        data: row.data,
    };
}

export async function nuqGetJob<T>(id: string): Promise<NuQJob<T> | null> {
    const start = Date.now();
    try {
        const result = await nuqPool.query("SELECT id, status, created_at, data FROM nuq.queue_scrape WHERE nuq.queue_scrape.id = $1;", [id]);
        if (result.rowCount === 0) {
            return null;
        }
        return rowToJob<T>(result.rows[0]);
    } finally {
        const end = Date.now();
        logger.info("nuqGetJob metrics", { module: "nuq/metrics", method: "nuqGetJob", duration: end - start });
    }
}

export async function nuqGetJobs<T>(ids: string[]): Promise<NuQJob<T>[]> {
    if (ids.length === 0) {
        return [];
    }

    const start = Date.now();
    try {
        const result = await nuqPool.query("SELECT id, status, created_at, data FROM nuq.queue_scrape WHERE nuq.queue_scrape.id = ANY($1);", [ids]);
        return result.rows.map(row => rowToJob<T>(row));
    } finally {
        const end = Date.now();
        logger.info("nuqGetJobs metrics", { module: "nuq/metrics", method: "nuqGetJobs", duration: end - start });
    }
}

// === Producer

export async function nuqAddJob<T>(id: string, data: T): Promise<NuQJob<T>> {
    const start = Date.now();
    try {
        const result = await nuqPool.query("INSERT INTO nuq.queue_scrape (id, data) VALUES ($1, $2) RETURNING id, status, created_at, data;", [id, data]);
        return rowToJob<T>(result.rows[0]);
    } finally {
        const end = Date.now();
        logger.info("nuqAddJob metrics", { module: "nuq/metrics", method: "nuqAddJob", duration: end - start });
    }
}

export async function nuqWaitForJob(id: string, timeout: number | null): Promise<"completed" | "failed"> {
    const done = new Promise<"completed" | "failed">(async (resolve, reject) => {
        let timer: NodeJS.Timeout | null = null;
        if (timeout !== null) {
            timer = setTimeout(() => {
                nuqRemoveListener(id, listener);
                reject(new Error("Timed out"));
            }, timeout);
        }

        const listener = (msg: "completed" | "failed") => {
            if (timer) {
                clearTimeout(timer);
            }
            resolve(msg);
        }

        try {
            await nuqAddListener(id, listener);
        } catch (e) {
            reject(e);
        }

        try {
            const job = await nuqGetJob<any>(id);
            if (job && ["completed", "failed"].includes(job.status)) {
                nuqRemoveListener(id, listener);
                if (timer) {
                    clearTimeout(timer);
                }
                resolve(job.status as "completed" | "failed");
                return;
            }
        } catch (e) {
            logger.warn("nuqGetJob ensure check failed", { module: "nuq", method: "nuqWaitForJob", error: e });
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

        const result = await client.query("SELECT id, status, created_at, data FROM nuq.queue_scrape WHERE nuq.queue_scrape.status = 'queued'::nuq.job_status ORDER BY nuq.queue_scrape.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;");
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return null;
        }

        await client.query("UPDATE nuq.queue_scrape SET status = 'active'::nuq.job_status, lock = $1, locked_at = now() WHERE id = $2;", [lock, result.rows[0].id]);
        await client.query("COMMIT");

        return rowToJob<any>(result.rows[0]);
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
    const client = await nuqPool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query("UPDATE nuq.queue_scrape SET status = $1, lock = null, locked_at = null WHERE id = $2 AND lock = $3;", [status, id, lock]);
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return false;
        }

        await client.query("SELECT pg_notify('nuq.queue_scrape', $1);", [`${id}|${status}`]);
        await client.query("COMMIT");
        return true;
    } finally {
        await client.release();
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

export async function nuqHealthCheck(): Promise<boolean> {
    const start = Date.now();
    const result = await nuqPool.query("SELECT 1;");
    const end = Date.now();
    logger.info("nuqHealthCheck metrics", { module: "nuq/metrics", method: "nuqHealthCheck", duration: end - start });
    return result.rowCount !== 0;
}

// === Cleanup

export async function nuqShutdown() {
    if (nuqListener) {
        const nl = nuqListener;
        nuqListener = null;
        nuqListens = {};
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
//   status nuq.job_status NOT NULL DEFAULT 'queued'::nuq.job_status,
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
//  SET status = 'queued'::nuq.job_status, lock = null, locked_at = null
//  WHERE nuq.queue_scrape.locked_at <= now() - interval '1 minute'
//  AND nuq.queue_scrape.status = 'active'::nuq.job_status;
// $$);
