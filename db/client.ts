import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Lazy Drizzle client. Reading `db` throws if `DATABASE_URL` is unset, so
 * importing this module is always safe — only call `db()` from code paths
 * that genuinely need Postgres. The Clerk webhook is the only consumer
 * landing in Phase 5.3; full sync wiring arrives in 5.4.
 */
type DB = NeonHttpDatabase<typeof schema>;

let cached: DB | null = null;

export function db(): DB {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. See docs/NEON_SETUP.md for the Neon signup runbook.',
    );
  }
  const sql = neon(url);
  cached = drizzle(sql, { schema });
  return cached;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export { schema };
