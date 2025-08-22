import { logger } from "../../lib/logger";
import { Client, Pool } from "pg";

// === Basics

let nuqShuttingDown = false;

const nuqPool = new Pool({
    connectionString: process.env.NUQ_DATABASE_URL, // may be a pgbouncer transaction pooler URL
    application_name: "nuq",
});

nuqPool.on("error", (err) => logger.error("Error in NuQ idle client", { err, module: "nuq" }));

export type NuQJobStatus = "queued" | "active" | "completed" | "failed"; // must match nuq.job_status enum
export type NuQJob<Data = any, ReturnValue = any> = {
    id: string;
    status: NuQJobStatus;
    createdAt: Date;
    data: Data;
    finishedAt?: Date;
    returnvalue?: ReturnValue;
    failedReason?: string;
};

// === Listener

let nuqListener: Client | null = null;
let nuqListens: { [key: string]: ((status: "completed" | "failed") => void)[] } = {};

async function nuqStartListener() {
    if (nuqListener || nuqShuttingDown) return;

    nuqListener = new Client({
        connectionString: process.env.NUQ_DATABASE_URL_LISTEN ?? process.env.NUQ_DATABASE_URL, // will always be a direct connection
        application_name: "nuq_listener",
    });

    nuqListener.on("notification", (msg) => {
        const tok = (msg.payload ?? "unknown|unknown").split("|");
        if (tok[0] in nuqListens) {
            nuqListens[tok[0]].forEach(listener => listener(tok[1] as "completed" | "failed"));
            delete nuqListens[tok[0]];
        }
    });

    nuqListener.on("error", (err) => logger.error("Error in NuQ listener", { err, module: "nuq" }));

    nuqListener.on("end", () => {
        logger.info("NuQ listener disconnected", { module: "nuq" });
        nuqListener = null;
        setTimeout(() => {
            nuqStartListener().catch(err => logger.error("Error in NuQ listener reconnect", { err, module: "nuq" }));
        }, 250);
    });

    await nuqListener.connect();
    await nuqListener.query("LISTEN \"nuq.queue_scrape\";");

    (async () => {
        const backedUpJobs = (await nuqGetJobs(Object.keys(nuqListens))).filter(job => ["completed", "failed"].includes(job.status));
        for (const job of backedUpJobs) {
            nuqListens[job.id].forEach(listener => listener(job.status as "completed" | "failed"));
            delete nuqListens[job.id];
        }
    })();
}

async function nuqAddListener(id: string, listener: (status: "completed" | "failed") => void) {
    await nuqStartListener();

    if (!(id in nuqListens)) nuqListens[id] = [listener];
    else nuqListens[id].push(listener);
}

async function nuqRemoveListener(id: string, listener: (status: "completed" | "failed") => void) {
    if (id in nuqListens) {
        nuqListens[id] = nuqListens[id].filter(l => l !== listener);
        if (nuqListens[id].length === 0) delete nuqListens[id];
    }
}

// === Job management

const jobReturning = ["id", "status", "created_at", "data", "finished_at", "returnvalue", "failedreason"];
function rowToJob<Data, ReturnValue>(row: any): NuQJob<Data, ReturnValue> | null {
    if (!row) return null;
    return {
        id: row.id,
        status: row.status,
        createdAt: new Date(row.created_at),
        data: row.data,
        finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
        returnvalue: row.returnvalue ?? undefined,
        failedReason: row.failedreason ?? undefined,
    };
}

export async function nuqGetJob<Data, ReturnValue>(id: string): Promise<NuQJob<Data, ReturnValue> | null> {
    const start = Date.now();
    try {
        return rowToJob<Data, ReturnValue>((await nuqPool.query(`SELECT ${jobReturning.join(", ")} FROM nuq.queue_scrape WHERE nuq.queue_scrape.id = $1;`, [id])).rows[0]);
    } finally {
        logger.info("nuqGetJob metrics", { module: "nuq/metrics", method: "nuqGetJob", duration: Date.now() - start, scrapeId: id });
    }
}

export async function nuqGetJobs<Data, ReturnValue>(ids: string[]): Promise<NuQJob<Data, ReturnValue>[]> {
    if (ids.length === 0) return [];
    
    const start = Date.now();
    try {
        return (await nuqPool.query(`SELECT ${jobReturning.join(", ")} FROM nuq.queue_scrape WHERE nuq.queue_scrape.id = ANY($1::uuid[]);`, [ids])).rows.map(row => rowToJob<Data, ReturnValue>(row)!);
    } finally {
        logger.info("nuqGetJobs metrics", { module: "nuq/metrics", method: "nuqGetJobs", duration: Date.now() - start, scrapeIds: ids.length });
    }
}

export async function nuqGetJobsWithStatus<Data, ReturnValue>(ids: string[], status: NuQJobStatus): Promise<NuQJob<Data, ReturnValue>[]> {
    if (ids.length === 0) return [];
    
    const start = Date.now();
    try {
        return (await nuqPool.query(`SELECT ${jobReturning.join(", ")} FROM nuq.queue_scrape WHERE nuq.queue_scrape.id = ANY($1::uuid[]) AND nuq.queue_scrape.status = $2::nuq.job_status;`, [ids, status])).rows.map(row => rowToJob<Data, ReturnValue>(row)!);
    } finally {
        logger.info("nuqGetJobsWithStatus metrics", { module: "nuq/metrics", method: "nuqGetJobsWithStatus", duration: Date.now() - start, scrapeIds: ids.length, status });
    }
}

export async function nuqGetJobsWithStatuses<Data, ReturnValue>(ids: string[], statuses: NuQJobStatus[]): Promise<NuQJob<Data, ReturnValue>[]> {
    if (ids.length === 0) return [];
    
    const start = Date.now();
    try {
        return (await nuqPool.query(`SELECT ${jobReturning.join(", ")} FROM nuq.queue_scrape WHERE nuq.queue_scrape.id = ANY($1::uuid[]) AND nuq.queue_scrape.status = ANY($2::nuq.job_status[]);`, [ids, statuses])).rows.map(row => rowToJob<Data, ReturnValue>(row)!);
    } finally {
        logger.info("nuqGetJobsWithStatuses metrics", { module: "nuq/metrics", method: "nuqGetJobsWithStatuses", duration: Date.now() - start, scrapeIds: ids.length, statuses });
    }
}

export async function nuqRemoveJob(id: string): Promise<boolean> {
    const start = Date.now();
    try {
        return (await nuqPool.query("DELETE FROM nuq.queue_scrape WHERE id = $1;", [id])).rowCount !== 0;
    } finally {
        logger.info("nuqRemoveJob metrics", { module: "nuq/metrics", method: "nuqRemoveJob", duration: Date.now() - start, scrapeId: id });
    }
}

export async function nuqRemoveJobs(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const start = Date.now();
    try {
        return (await nuqPool.query("DELETE FROM nuq.queue_scrape WHERE id = ANY($1::uuid[]);", [ids])).rowCount ?? 0;
    } finally {
        logger.info("nuqRemoveJobs metrics", { module: "nuq/metrics", method: "nuqRemoveJobs", duration: Date.now() - start, scrapeIds: ids.length });
    }
}

// === Producer

export async function nuqAddJob<Data, ReturnValue>(id: string, data: Data): Promise<NuQJob<Data, ReturnValue>> {
    const start = Date.now();
    try {
        return rowToJob<Data, ReturnValue>((await nuqPool.query(`INSERT INTO nuq.queue_scrape (id, data) VALUES ($1, $2) RETURNING ${jobReturning.join(", ")};`, [id, data])).rows[0])!;
    } finally {
        logger.info("nuqAddJob metrics", { module: "nuq/metrics", method: "nuqAddJob", duration: Date.now() - start, scrapeId: id });
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
            if (timer) clearTimeout(timer);
            resolve(msg);
        }

        try {
            await nuqAddListener(id, listener);
        } catch (e) {
            reject(e);
        }

        try {
            const job = await nuqGetJob<any, any>(id);
            if (job && ["completed", "failed"].includes(job.status)) {
                nuqRemoveListener(id, listener);
                if (timer) clearTimeout(timer);
                resolve(job.status as "completed" | "failed");
                return;
            }
        } catch (e) {
            logger.warn("nuqGetJob ensure check failed", { module: "nuq", method: "nuqWaitForJob", error: e, scrapeId: id });
        }
    });

    return done;
}

// === Consumer

export async function nuqGetJobToProcess(lock: string): Promise<NuQJob<any, any> | null> {
    const start = Date.now();
    try {
        return rowToJob<any, any>((await nuqPool.query(`
            WITH next AS (SELECT ${jobReturning.join(", ")} FROM nuq.queue_scrape WHERE nuq.queue_scrape.status = 'queued'::nuq.job_status ORDER BY nuq.queue_scrape.created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
            UPDATE nuq.queue_scrape q SET status = 'active'::nuq.job_status, lock = $1, locked_at = now() FROM next WHERE q.id = next.id RETURNING ${jobReturning.map(x => `q.${x}`).join(", ")};
        `, [lock])).rows[0])!;
    } finally {
        logger.info("nuqGetJobToProcess metrics", { module: "nuq/metrics", method: "nuqGetJobToProcess", duration: Date.now() - start });
    }
}

export async function nuqRenewLock(id: string, lock: string): Promise<boolean> {
    const start = Date.now();
    try {
        return (await nuqPool.query("UPDATE nuq.queue_scrape SET locked_at = now() WHERE id = $1 AND lock = $2 AND status = 'active'::nuq.job_status;", [id, lock])).rowCount !== 0;
    } finally {
        logger.info("nuqRenewLock metrics", { module: "nuq/metrics", method: "nuqRenewLock", duration: Date.now() - start, scrapeId: id });
    }
}

export async function nuqJobFinish(id: string, lock: string, returnvalue: any | null): Promise<boolean> {
    const start = Date.now();
    try {
        return (await nuqPool.query(`
            WITH updated AS (UPDATE nuq.queue_scrape SET status = 'completed'::nuq.job_status, lock = null, locked_at = null, finished_at = now(), returnvalue = $3 WHERE id = $1 AND lock = $2 RETURNING id)
            SELECT pg_notify('nuq.queue_scrape', (id::text || '|completed')) FROM updated;
        `, [id, lock, returnvalue])).rowCount !== 0;
    } finally {
        logger.info("nuqJobFinish metrics", { module: "nuq/metrics", method: "nuqJobFinish", duration: Date.now() - start, scrapeId: id });
    }
}

export async function nuqJobFail(id: string, lock: string, failedReason: string): Promise<boolean> {
    const start = Date.now();
    try {
        return (await nuqPool.query(`
            WITH updated AS (UPDATE nuq.queue_scrape SET status = 'failed'::nuq.job_status, lock = null, locked_at = null, finished_at = now(), failedreason = $3 WHERE id = $1 AND lock = $2 RETURNING id)
            SELECT pg_notify('nuq.queue_scrape', (id::text || '|failed')) FROM updated;
        `, [id, lock, failedReason])).rowCount !== 0;
    } finally {
        logger.info("nuqJobFail metrics", { module: "nuq/metrics", method: "nuqJobFail", duration: Date.now() - start, scrapeId: id });
    }
}

// === Metrics

export async function nuqGetMetrics(): Promise<string> {
    const start = Date.now();
    const result = await nuqPool.query("SELECT status, COUNT(id) as count FROM nuq.queue_scrape GROUP BY status ORDER BY count DESC;");
    logger.info("nuqGetMetrics metrics", { module: "nuq/metrics", method: "nuqGetMetrics", duration: Date.now() - start });
    return `# HELP nuq_queue_scrape_job_count Number of jobs in each status\n# TYPE nuq_queue_scrape_job_count gauge\n${result.rows.map(x => `nuq_queue_scrape_job_count{status="${x.status}"} ${x.count}`).join("\n")}\n`;
}

export function nuqGetLocalMetrics(): string {
    return `# HELP nuq_pool_waiting_count Number of requests waiting in the pool\n# TYPE nuq_pool_waiting_count gauge\nnuq_pool_waiting_count ${nuqPool.waitingCount}\n
# HELP nuq_pool_idle_count Number of connections idle in the pool\n# TYPE nuq_pool_idle_count gauge\nnuq_pool_idle_count ${nuqPool.idleCount}\n
# HELP nuq_pool_total_count Number of connections in the pool\n# TYPE nuq_pool_total_count gauge\nnuq_pool_total_count ${nuqPool.totalCount}\n`;
}

export async function nuqHealthCheck(): Promise<boolean> {
    const start = Date.now();
    try {
        return (await nuqPool.query("SELECT 1;")).rowCount !== 0;
    } finally {
        logger.info("nuqHealthCheck metrics", { module: "nuq/metrics", method: "nuqHealthCheck", duration: Date.now() - start });
    }
}

// === Cleanup

export async function nuqShutdown() {
    nuqShuttingDown = true;
    if (nuqListener) {
        const nl = nuqListener;
        nuqListener = null;
        nuqListens = {};
        await nl.query("UNLISTEN \"nuq.queue_scrape\";");
        await nl.end();
    }
    await nuqPool.end();
}
