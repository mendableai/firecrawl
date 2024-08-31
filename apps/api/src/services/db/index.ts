import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { withReplicas } from 'drizzle-orm/pg-core';
import { Pool } from "pg";

function createDB() {
    if (process.env.DATABASE_URI) {
        const db = drizzle(new Pool({
            connectionString: process.env.DATABASE_URI,
        }))

        if (process.env.DATABASE_REPLICA_URI) {
            const replica = drizzle(new Pool({
                connectionString: process.env.DATABASE_REPLICA_URI,
            }));

            return withReplicas(db, [replica])
        } else {
            return db;
        }
    } else {
        return { no: true };
    }
}

// Using a Proxy to handle dynamic access to the DB client or service methods.
// This approach ensures that if DB is not configured, any attempt to use it will result in a clear error.
const db = new Proxy(
    createDB(),
    {
        get: function (target, prop, receiver) {
        const client = target;
        // If the DB client is not initialized, intercept property access to provide meaningful error feedback.
        if ((client as any).no === true) {
            return () => {
                throw new Error("Database client is not configured.");
            };
        }
        // Direct access to DB properties takes precedence.
        if (prop in target) {
            return Reflect.get(target, prop, receiver);
        }
        // Otherwise, delegate access to the DB client.
        return Reflect.get(client, prop, receiver);
        },
    }
) as unknown as NodePgDatabase<Record<string, never>>;

export default db;
