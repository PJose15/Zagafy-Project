import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only, token-gated attestation for the cloud-history staging tests.
 * This proves configuration/schema presence, not provider health or launch approval. */
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const token = process.env.HEALTH_TOKEN?.trim();
  if (!token) return NextResponse.json({ ok: false, code: 'probe_disabled' }, { status: 503, headers });
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get('x-health-token') ?? ''), digest(token))) {
    return NextResponse.json({ ok: false, code: 'forbidden' }, { status: 403, headers });
  }
  const missing: string[] = [];
  if (process.env.ZAGAFY_STAGING !== 'true' || process.env.VERCEL_ENV !== 'preview') missing.push('isolated_preview_attestation');
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'saas') missing.push('saas_mode');
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') || !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_')) missing.push('clerk_development_instance');
  for (const key of ['DATABASE_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    if (!process.env[key]?.trim()) missing.push(key);
  }
  const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!/^[a-f0-9]{40}$/.test(commit)) missing.push('deployed_commit');
  // Do not contact an unverified/production database just to attest a test environment.
  if (!missing.length) {
    try {
      const columns = await db().execute<{ table_name: string; column_name: string }>(sql`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN
          ('users','stories','chapters','chat_messages','sessions','sync_tombstones','deleted_stories')`);
      const rows = Array.isArray(columns) ? columns : (columns as unknown as {rows: {table_name:string;column_name:string}[]}).rows;
      const present = new Set(rows.map(row => `${row.table_name}.${row.column_name}`));
      for (const column of ['users.id','stories.version','chapters.version','chat_messages.metadata','chat_messages.version',
        'chat_messages.synced_at','sessions.synced_at','sync_tombstones.deleted_at','deleted_stories.recipients']) {
        if (!present.has(column)) missing.push(`schema:${column}`);
      }
    } catch {
      missing.push('database_read'); // Never return connection strings or database error details.
    }
  }
  const ready = missing.length === 0;
  return NextResponse.json({ ok: ready, data: { scope: 'cloud-history-acceptance', ready, commit, missing } }, {
    status: ready ? 200 : 503, headers,
  });
}
