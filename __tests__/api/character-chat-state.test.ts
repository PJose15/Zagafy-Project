import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-error', () => ({
  getErrorStatus: vi.fn().mockReturnValue(500),
}));

import { POST } from '@/app/api/character-chat/state/route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/character-chat/state', {
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
  mode: 'confrontation',
  transcript: 'user: Did you falsify the map?\nassistant: ...Yes. I did.',
  currentState: { emotionalState: 'guarded', pressureLevel: 'Medium', indicator: 'under pressure' },
};

describe('POST /api/character-chat/state', () => {
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

  it('returns the evolved state on clean JSON', async () => {
    mockFetch.mockResolvedValue(
      anthropicText('{"emotionalState":"cracking under guilt","pressureLevel":"High","indicator":"emotionally conflicted"}'),
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.state).toEqual({
      emotionalState: 'cracking under guilt',
      pressureLevel: 'High',
      indicator: 'emotionally conflicted',
    });
  });

  it('extracts JSON even when wrapped in prose / fences', async () => {
    mockFetch.mockResolvedValue(
      anthropicText('Here is the state:\n```json\n{"emotionalState":"defiant","pressureLevel":"Critical","indicator":"at risk of contradiction"}\n```'),
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.state.pressureLevel).toBe('Critical');
    expect(data.state.indicator).toBe('at risk of contradiction');
  });

  it('returns error="parse_error" on invalid enum values', async () => {
    mockFetch.mockResolvedValue(
      anthropicText('{"emotionalState":"x","pressureLevel":"Extreme","indicator":"melting"}'),
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.state).toBeNull();
    expect(data.error).toBe('parse_error');
  });

  it('returns error="parse_error" on non-JSON output', async () => {
    mockFetch.mockResolvedValue(anthropicText('I cannot determine the state.'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBe('parse_error');
  });

  it('returns 400 when characterName is missing', async () => {
    const { characterName: _n, ...rest } = validBody;
    void _n;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
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
    expect(res.status).toBe(200);
    expect(data.state).toBeNull();
    expect(data.error).toBe('rate_limited');
  });

  it('returns error="upstream_error" on upstream 500', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBe('upstream_error');
  });

  it('returns error="timeout" on AbortError', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.error).toBe('timeout');
  });
});
