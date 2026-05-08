import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-error', () => ({
  getErrorStatus: vi.fn().mockReturnValue(500),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent };
  },
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: { BLOCK_NONE: 'BLOCK_NONE' },
}));

vi.mock('@/lib/ai-config', () => ({
  AI_MODEL: 'gemini-2.5-flash',
  SAFETY_SETTINGS: [],
  AI_CONFIG: {},
}));

import { POST } from '@/app/api/closing-question/route';
import { rateLimit } from '@/lib/rate-limit';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/closing-question', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/closing-question', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a question on success', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'What moved you about today?' });
    const res = await POST(makeRequest({ wordsWritten: 500, storyContext: 'A dragon appears.' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question).toBe('What moved you about today?');
  });

  it('returns 400 when wordsWritten is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when wordsWritten is a string', async () => {
    const res = await POST(makeRequest({ wordsWritten: 'many' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(new (await import('next/server')).NextResponse(null, { status: 429 }));
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    expect(res.status).toBe(429);
  });

  it('returns fallback question when AI fails', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('AI failed'));
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question).toBeDefined();
    expect(body.question.length).toBeGreaterThan(0);
  });

  it('returns fallback question when response text is empty', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });
    const res = await POST(makeRequest({ wordsWritten: 300 }));
    const body = await res.json();
    expect(body.question).toBeDefined();
    expect(body.question.length).toBeGreaterThan(0);
  });

  it('returns fallback question when API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.question).toBeDefined();
  });

  it('works without storyContext', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'A reflective question?' });
    const res = await POST(makeRequest({ wordsWritten: 50 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question).toBe('A reflective question?');
  });

  it('trims the returned question', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '  What did you learn?  ' });
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.question).toBe('What did you learn?');
  });

  it('accepts wordsWritten of 0', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'Why no words today?' });
    const res = await POST(makeRequest({ wordsWritten: 0 }));
    expect(res.status).toBe(200);
  });

  it('returns fallback when response text is null', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: null });
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.question).toBeDefined();
  });

  it('returns fallback when response text is undefined', async () => {
    mockGenerateContent.mockResolvedValueOnce({});
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.question).toBeDefined();
  });

  // ── CB-12 (Phase 3.2) — degraded surfacing ──

  it('flags degraded=true with reason when API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.degraded).toBe(true);
    expect(body.degradationReason).toBe('gemini_key_missing');
  });

  it('flags degraded=true with reason when response text is empty', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.degraded).toBe(true);
    expect(body.degradationReason).toBe('empty_response');
  });

  it('flags degraded=true with reason on upstream error', async () => {
    mockGenerateContent.mockRejectedValue(new Error('AI failed'));
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.degraded).toBe(true);
    expect(body.degradationReason).toBe('gemini_error');
  });

  it('does NOT set degraded on a successful response', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'What moved you?' });
    const res = await POST(makeRequest({ wordsWritten: 100 }));
    const body = await res.json();
    expect(body.degraded).toBeUndefined();
    expect(body.question).toBe('What moved you?');
  });
});
