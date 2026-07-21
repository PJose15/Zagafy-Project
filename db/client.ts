import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * Lazy Drizzle client. Reading `db` throws if `DATABASE_URL` is unset, so
 * importing this module is always safe — only call `db()` from code paths
 * that genuinely need Postgres.
 *
 * Driver: postgres-js against the Supabase transaction pooler (PgBouncer).
 * `prepare: false` is required — transaction-mode pooling can't hold
 * prepared statements across the pooled connections.
 */
type DB = PostgresJsDatabase<typeof schema>;

let cached: DB | null = null;

export function db(): DB {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Point it at a Postgres connection string (Supabase pooler or equivalent).',
    );
  }
  const sql = postgres(url, { prepare: false, max: 1 });
  cached = drizzle(sql, { schema });
  return cached;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
