import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), configured: vi.fn(), where: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireCloudUser: mocks.auth, isAuthError: (value: unknown) => value instanceof Response }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/db/client', () => ({ isDatabaseConfigured: mocks.configured, db: () => ({ select: () => ({ from: () => ({ where: mocks.where }) }) }) }));
import { GET } from '@/app/api/billing/status/route';
const request = () => new Request('http://localhost/api/billing/status') as import('next/server').NextRequest;
beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: 'owner' });
  mocks.configured.mockReturnValue(true);
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValue([{ plan: 'author', customer: 'cus_secret' }]);
});
it('returns only the authenticated account plan and a boolean billing flag without caching', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  const result = await response.json();
  expect(result.plan).toBe('author');
  expect(result.hasBillingAccount).toBe(true);
  expect(JSON.stringify(result)).not.toContain('cus_secret');
  expect(mocks.where).toHaveBeenCalled();
});
it('rejects anonymous access before reading the database', async () => {
  mocks.where.mockClear(); mocks.auth.mockResolvedValue(new Response('', { status: 401 }));
  expect((await GET(request())).status).toBe(401);
  expect(mocks.where).not.toHaveBeenCalled();
});
it('does not report Free when the database is unavailable', async () => {
  mocks.limit.mockRejectedValue(new Error('offline'));
  expect((await GET(request())).status).toBe(503);
});
it('does not report Free when account provisioning is pending', async () => {
  mocks.limit.mockResolvedValue([]);
  expect((await GET(request())).status).toBe(404);
});
it('rejects an invalid stored plan', async () => {
  mocks.limit.mockResolvedValue([{ plan: 'constructor', customer: null }]);
  expect((await GET(request())).status).toBe(503);
});
