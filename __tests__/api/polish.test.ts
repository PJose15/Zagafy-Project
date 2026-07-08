import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-error', () => ({
  getErrorStatus: vi.fn().mockReturnValue(500),
}));

import { POST } from '@/app/api/polish/route';
import { rateLimit } from '@/lib/rate-limit';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/polish', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/polish', () => {
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

  it('returns polished text on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: 'Polished version of the text.' }],
      }),
    });

    const res = await POST(makeRequest({ transcript: 'um so like the text here' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.polishedText).toBe('Polished version of the text.');
  });

  it('returns 400 for empty transcript', async () => {
    const res = await POST(makeRequest({ transcript: '' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('required');
  });

  it('returns 400 for missing transcript', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 500 when API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toContain('API key');
  });

  it('returns 429 when rate limited by middleware', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimit).mockResolvedValueOnce(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    );

    const res = await POST(makeRequest({ transcript: 'hello' }));
    expect(res.status).toBe(429);
  });

  it('returns 429 when AI provider rate limits', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
    });

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    expect(res.status).toBe(429);
  });

  it('returns provider error status on non-429 failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    expect(res.status).toBe(503);
  });

  it('returns 504 on timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortError);

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    expect(res.status).toBe(504);
  });

  // --- Input validation edge cases ---

  it('returns 400 for whitespace-only transcript', async () => {
    const res = await POST(makeRequest({ transcript: '   \n\t  ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when transcript is a number', async () => {
    const res = await POST(makeRequest({ transcript: 42 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when transcript is null', async () => {
    const res = await POST(makeRequest({ transcript: null }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when transcript is boolean', async () => {
    const res = await POST(makeRequest({ transcript: true }));
    expect(res.status).toBe(400);
  });

  // --- Response parsing edge cases ---

  it('returns empty polishedText when content array is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [] }),
    });

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.polishedText).toBe('');
  });

  it('returns empty polishedText when content is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.polishedText).toBe('');
  });

  it('extracts the text block even when a thinking block comes first (Opus 4.7+/Fable)', async () => {
    // A thinking-first model returns the reasoning block at content[0]; the old
    // content[0].text extraction returned empty. extractText skips it.
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [
          { type: 'thinking', thinking: 'Consider the filler words...' },
          { type: 'text', text: 'The polished result.' },
        ],
      }),
    });

    const res = await POST(makeRequest({ transcript: 'um so the text' }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.polishedText).toBe('The polished result.');
  });

  it('trims polished text', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: '  Polished text with spaces  ' }],
      }),
    });

    const res = await POST(makeRequest({ transcript: 'hello' }));
    const data = await res.json();
    expect(data.polishedText).toBe('Polished text with spaces');
  });

  it('trims the input transcript before sending', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'clean' }] }),
    });

    await POST(makeRequest({ transcript: '  hello world  ' }));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.messages[0].content).toBe('hello world');
  });

  // --- Fetch network errors ---

  it('returns 500 on TypeError (network failure)', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    expect(res.status).toBe(500);
  });

  // --- Anthropic API headers ---

  it('sends correct headers to Anthropic API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'ok' }] }),
    });

    await POST(makeRequest({ transcript: 'hello' }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-key');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('uses claude-sonnet-4 model', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'ok' }] }),
    });

    await POST(makeRequest({ transcript: 'hello' }));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.model).toContain('claude-sonnet');
  });

  it('includes system prompt', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'ok' }] }),
    });

    await POST(makeRequest({ transcript: 'hello' }));

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.system).toContain('prose editor');
  });

  // --- Provider error messages ---

  it('returns specific error for 429', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const res = await POST(makeRequest({ transcript: 'hello' }));
    const data = await res.json();
    expect(data.error).toContain('Rate limited');
  });

  it('returns generic error for non-429 provider failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const res = await POST(makeRequest({ transcript: 'hello' }));
    const data = await res.json();
    expect(data.error).toContain('AI provider error');
  });

  // --- Signal/abort controller is passed ---

  it('passes an AbortSignal to fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'ok' }] }),
    });

    await POST(makeRequest({ transcript: 'hello' }));

    const options = mockFetch.mock.calls[0][1];
    expect(options.signal).toBeDefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  // --- ANTHROPIC_API_KEY as empty string ---

  it('returns 500 when API key is empty string', async () => {
    process.env.ANTHROPIC_API_KEY = '';

    const res = await POST(makeRequest({ transcript: 'hello world' }));
    expect(res.status).toBe(500);
  });

  // --- Unicode transcript ---

  it('handles unicode transcript', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'Olá mundo' }] }),
    });

    const res = await POST(makeRequest({ transcript: 'olá mundo 你好' }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.polishedText).toBe('Olá mundo');
  });
});
