import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function run() {
    console.log('Migration started ⌛');

    const dbUrl = (
        process.env.NODE_ENV === 'production'
            ? process.env.DATABASE_URL
            : process.env.DEV_DATABASE_URL
    ) as string;

    if (!dbUrl) throw new Error('No database url found');

    const client = postgres(dbUrl, {
        max: 1,
        ssl: process.env.NODE_ENV === 'production' ? 'prefer' : undefined,
    });

    const db = drizzle(client);
    try {
        await migrate(db, { migrationsFolder: './drizzle', migrationsSchema: 'public' });
        console.log('Migration completed ✅');
    } catch (error) {
        console.error('Migration failed 🚨:', error);
    } finally {
        await client.end();
    }
}

run().catch((error) =>
    console.error('Error in migration process 🚨:', error),
);