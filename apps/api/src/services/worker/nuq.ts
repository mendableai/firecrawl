import z from "zod";
import { logger } from "../../lib/logger";
import { Pool } from "pg";

// === Basics

const nuqPool = new Pool({
    connectionString: process.env.NUQ_DATABASE_URL,
});

nuqPool.on("error", (err) => {
    logger.error("Error in NuQ idle client", { err, module: "nuq" });
});

export async function nuqShutdown() {
    return await nuqPool.end();
}

export type NuQJob<T> = {
    id: string;
    createdAt: Date;
    data: T;
}

// === Producer

export async function nuqAddJob<T>(id: string, data: T): Promise<NuQJob<T>> {
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
    }
}

export async function nuqWaitForJob(id: string, timeout: number | null): Promise<"completed" | "failed"> {
    try {
        z.string().uuid().parse(id);
    } catch (e) {
        throw new Error("Invalid job ID");
    }

    const client = await nuqPool.connect();

    const done = new Promise<"completed" | "failed">((resolve, reject) => {
        client.on("notification", msg => {
            resolve(msg.payload as "completed" | "failed");
        });

        client.on("error", e => {
            reject(e);
        });

        if (timeout !== null) {
            setTimeout(() => {
                reject(new Error("Timed out"));
            }, timeout);
        }
    }).finally(() => client.release());

    client.query(`LISTEN "nuq.queue_scrape.${id}";`);

    return done;
}

// === Consumer

export async function nuqGetJobToProcess(lock: string): Promise<NuQJob<any> | null> {
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
    }
}

export async function nuqRenewLock(id: string, lock: string): Promise<boolean> {
    const result = await nuqPool.query("UPDATE nuq.queue_scrape SET locked_at = now() WHERE id = $1 AND lock = $2 AND status = 'active'::nuq.job_status;", [id, lock]);
    return result.rowCount !== 0;
}

export async function nuqJobEnd(id: string, lock: string, status: "completed" | "failed"): Promise<boolean> {
    const result = await nuqPool.query("UPDATE nuq.queue_scrape SET status = $1, lock = null, locked_at = null WHERE id = $2 AND lock = $3;", [status, id, lock]);
    if (result.rowCount === 0) {
        return false;
    } else {
        await nuqPool.query("SELECT pg_notify($1, $2);", [`nuq.queue_scrape.${id}`, status]);
        return true;
    }
}
