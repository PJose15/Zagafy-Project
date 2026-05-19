import { describe, it, expect, beforeEach, vi } from 'vitest';

const originalEnv = { ...process.env };

const mockVerify = vi.fn();
class MockWebhook {
  constructor(_secret: string) {}
  verify = mockVerify;
}
vi.mock('svix', () => ({ Webhook: MockWebhook }));

const mockInsertOnConflict = vi.fn().mockResolvedValue(undefined);
const mockInsertValues = vi.fn(() => ({ onConflictDoUpdate: mockInsertOnConflict }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({ insert: mockInsert, delete: mockDelete })),
  isDatabaseConfigured: vi.fn(() => true),
}));

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'svix-id': headers['svix-id'] ?? 'msg_test',
      'svix-timestamp': headers['svix-timestamp'] ?? '1700000000',
      'svix-signature': headers['svix-signature'] ?? 'v1,signed',
      'content-type': 'application/json',
      ...headers,
    },
    body,
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/webhooks/clerk', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, CLERK_WEBHOOK_SECRET: 'whsec_test' };
    mockVerify.mockReset();
    mockInsertValues.mockClear();
    mockInsertOnConflict.mockClear();
    mockDelete.mockClear();
    mockDeleteWhere.mockClear();
  });

  it('returns 500 when CLERK_WEBHOOK_SECRET is unset', async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
  });

  it('returns 401 when Svix signature headers are missing', async () => {
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const req = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature verification throws', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(401);
  });

  it('upserts user on user.created', async () => {
    mockVerify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_abc123',
        email_addresses: [{ id: 'email_1', email_address: 'pj@example.com' }],
        primary_email_address_id: 'email_1',
        first_name: 'Pedro',
        last_name: 'Acosta',
      },
    });
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledWith({
      id: 'user_abc123',
      email: 'pj@example.com',
      name: 'Pedro Acosta',
    });
    expect(mockInsertOnConflict).toHaveBeenCalled();
  });

  it('uses primary email when multiple emails present', async () => {
    mockVerify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_x',
        email_addresses: [
          { id: 'email_a', email_address: 'old@example.com' },
          { id: 'email_b', email_address: 'new@example.com' },
        ],
        primary_email_address_id: 'email_b',
      },
    });
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    await POST(makeRequest('{}'));
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com' }));
  });

  it('skips when user.created has no email', async () => {
    mockVerify.mockReturnValue({
      type: 'user.created',
      data: { id: 'user_x', email_addresses: [] },
    });
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('deletes user on user.deleted (cascade handles downstream)', async () => {
    mockVerify.mockReturnValue({
      type: 'user.deleted',
      data: { id: 'user_gone' },
    });
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it('ignores unknown event types with 200', async () => {
    mockVerify.mockReturnValue({
      type: 'session.created' as never,
      data: { id: 'sess_x' },
    });
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignored).toBe('session.created');
  });
});
