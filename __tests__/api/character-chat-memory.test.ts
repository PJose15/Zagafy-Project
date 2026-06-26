import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/api-error', () => ({ getErrorStatus: vi.fn().mockReturnValue(500) }));

import { POST } from '@/app/api/character-chat/memory/route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/character-chat/memory', {
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
  transcript: 'user: Will you help me?\nassistant: I gave you my word.',
  existingMemory: '- Met for the first time; wary.',
};

describe('POST /api/character-chat/memory', () => {
  const originalEnv = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    global.fetch = mockFetch;
  });
  afterEach(() => { process.env = originalEnv; });

  it('returns updated memory text on success', async () => {
    mockFetch.mockResolvedValue(anthropicText('- Promised to help.\n- Trust is warming.'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.memory).toContain('Promised to help');
  });

  it('returns error="parse_error" on empty output', async () => {
    mockFetch.mockResolvedValue(anthropicText('   '));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.memory).toBeNull();
    expect(data.error).toBe('parse_error');
  });

  it('returns 400 when transcript is missing', async () => {
    const { transcript: _t, ...rest } = validBody;
    void _t;
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
    expect(data.error).toBe('rate_limited');
  });

  it('returns error="timeout" on AbortError', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBe('timeout');
  });
});
