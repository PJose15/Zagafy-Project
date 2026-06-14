import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
  // drizzle-kit 0.18.x ships a stale Config type that lacks `dialect`; the
  // CLI accepts it at runtime. Cast keeps `tsc --noEmit` clean until the
  // drizzle-kit upgrade. (This file is CLI-only — not part of the app build.)
} as Config;
