import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const database = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/db/client', () => ({ db: () => database }));
import { GET } from '@/app/api/health/readiness/route';
const request = (token = 'probe') => new NextRequest('http://localhost/api/health/readiness', { headers: { 'x-health-token': token } });
const columns = ['users.id','stories.version','chapters.version','chat_messages.metadata','chat_messages.version','chat_messages.synced_at','sessions.synced_at','sync_tombstones.deleted_at','deleted_stories.recipients']
  .map(column => { const [table_name,column_name]=column.split('.');return {table_name,column_name}; });
beforeEach(() => {
  database.execute.mockReset().mockResolvedValue(columns);
  for(const [key,value] of Object.entries({HEALTH_TOKEN:'probe',ZAGAFY_STAGING:'true',VERCEL_ENV:'preview',NEXT_PUBLIC_DEPLOYMENT_MODE:'saas',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'pk_test_a',CLERK_SECRET_KEY:'sk_test_a',DATABASE_URL:'private-db-value',
    UPSTASH_REDIS_REST_URL:'private-redis-value',UPSTASH_REDIS_REST_TOKEN:'private-redis-token',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40)})) vi.stubEnv(key,value);
});
afterEach(()=>vi.unstubAllEnvs());
it('refuses missing/incorrect probe authentication before touching the database',async()=>{
 vi.stubEnv('HEALTH_TOKEN','');expect((await GET(request())).status).toBe(503);vi.stubEnv('HEALTH_TOKEN','probe');expect((await GET(request('wrong'))).status).toBe(403);expect(database.execute).not.toHaveBeenCalled();
});
it.each([{VERCEL_ENV:'production'},{ZAGAFY_STAGING:'false'},{CLERK_SECRET_KEY:'sk_live_a'},{NEXT_PUBLIC_DEPLOYMENT_MODE:'embed'},{DATABASE_URL:''}])('fails closed before database access with unsafe configuration: %j',async patch=>{
 for(const [key,value] of Object.entries(patch))vi.stubEnv(key,value);expect((await GET(request())).status).toBe(503);expect(database.execute).not.toHaveBeenCalled();
});
it('reports the deployed commit and migrated schema without caching or credential values',async()=>{
 const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');const body=await response.text();expect(JSON.parse(body).data).toMatchObject({ready:true,commit:'a'.repeat(40),missing:[]});expect(body).not.toContain('private-');
});
it('rejects an old schema missing chat metadata or deletion receipts',async()=>{
 database.execute.mockResolvedValue(columns.filter(row=>!['metadata','recipients'].includes(row.column_name)));const response=await GET(request());expect(response.status).toBe(503);expect((await response.json()).data.missing).toEqual(['schema:chat_messages.metadata','schema:deleted_stories.recipients']);
});
it('redacts database failure details',async()=>{
 database.execute.mockRejectedValue(new Error('private-db-value'));const response=await GET(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain('private-db-value');
});
