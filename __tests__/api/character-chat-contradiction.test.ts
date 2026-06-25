import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-error', () => ({
  getErrorStatus: vi.fn().mockReturnValue(500),
}));

import { POST } from '@/app/api/character-chat/contradiction/route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/character-chat/contradiction', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function anthropicText(text: string) {
  return { ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text }] }) };
}

const validBody = {
  characterName: 'Mira',
  reply: 'My eyes are a deep, even brown — both the same.',
  canon: ['Mira has heterochromia: one grey eye and one hazel eye.'],
};

describe('POST /api/character-chat/contradiction', () => {
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

  it('flags a direct canon contradiction', async () => {
    mockFetch.mockResolvedValue(
      anthropicText('{"contradictions":[{"fact":"Mira has heterochromia","explanation":"The reply says both eyes are brown."}]}'),
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.contradictions).toHaveLength(1);
    expect(data.contradictions[0].fact).toContain('heterochromia');
    expect(data.contradictions[0].explanation).toContain('brown');
  });

  it('returns an empty array when there are no contradictions', async () => {
    mockFetch.mockResolvedValue(anthropicText('{"contradictions":[]}'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.contradictions).toEqual([]);
  });

  it('skips the upstream call entirely when there is no canon', async () => {
    const res = await POST(makeRequest({ ...validBody, canon: [] }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.contradictions).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('drops malformed flag entries (missing fact/explanation)', async () => {
    mockFetch.mockResolvedValue(
      anthropicText('{"contradictions":[{"fact":"ok","explanation":"ok"},{"fact":"no explanation"},{"explanation":"no fact"}]}'),
    );
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.contradictions).toHaveLength(1);
  });

  it('returns error="parse_error" on non-JSON output', async () => {
    mockFetch.mockResolvedValue(anthropicText('No contradictions found, all good!'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.contradictions).toEqual([]);
    expect(data.error).toBe('parse_error');
  });

  it('returns 400 when reply is missing', async () => {
    const { reply: _r, ...rest } = validBody;
    void _r;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('returns 500 not-configured when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.details?.reason).toBe('ai_not_configured');
  });

  it('returns error="rate_limited" on upstream 429', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.error).toBe('rate_limited');
  });

  it('returns error="timeout" on AbortError', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBe('timeout');
  });
});
