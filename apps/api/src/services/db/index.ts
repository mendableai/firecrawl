import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

function createDB() {
    if (process.env.DATABASE_URI) {
        const client = postgres(process.env.DATABASE_URI);
        return drizzle(client);
    } else {
        return null;
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
        if (client === null) {
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
);

export default db;
