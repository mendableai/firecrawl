import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/services/db/schema.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: globalThis.process.env.DATABASE_URI!,
    },
})