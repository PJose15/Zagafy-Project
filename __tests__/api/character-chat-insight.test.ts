import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-error', () => ({
  getErrorStatus: vi.fn().mockReturnValue(500),
}));

import { POST } from '@/app/api/character-chat/insight/route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/character-chat/insight', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const validBody = {
  characterName: 'Alice',
  transcript: 'user: Hello\nassistant: Hi there\nuser: Are you afraid?\nassistant: Always.',
};

describe('POST /api/character-chat/insight', () => {
  const originalEnv = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    global.fetch = mockFetch;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns an insight on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'They fear the unknown.' }] }),
    });

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insight).toBe('They fear the unknown.');
    expect(data.insightError).toBeUndefined();
  });

  it('returns 400 when characterName is missing', async () => {
    const res = await POST(makeRequest({ transcript: 'user: hi' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when transcript is missing', async () => {
    const res = await POST(makeRequest({ characterName: 'Alice' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 not-configured when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.details?.reason).toBe('ai_not_configured');
  });

  it('surfaces insightError="rate_limited" on upstream 429', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.insight).toBeNull();
    expect(data.insightError).toBe('rate_limited');
  });

  it('surfaces insightError="upstream_error" on upstream 500', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.insightError).toBe('upstream_error');
  });

  it('surfaces insightError="timeout" on AbortError', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.insightError).toBe('timeout');
  });

  it('surfaces insightError="parse_error" on an empty/unrecognized body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ /* no content array */ }),
    });
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.insight).toBeNull();
    expect(data.insightError).toBe('parse_error');
  });
});
