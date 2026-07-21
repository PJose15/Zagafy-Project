import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Always allow through the rate limiter.
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// requireUser returns a local user (auth-off); never an error in tests.
vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: 'local-user', embedMode: false }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

// Monthly AI quota — allowed by default; the quota test flips it to a 429.
const mockEnforceAiQuota = vi.fn(async (): Promise<Response | null> => null);
vi.mock('@/lib/ai-quota', () => ({
  enforceAiQuota: mockEnforceAiQuota,
}));

// Mock @google/genai — routes call ai.models.generateContent.
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  const MockGoogleGenAI = class {
    models = { generateContent: mockGenerateContent };
  };
  return { GoogleGenAI: MockGoogleGenAI };
});

vi.mock('@/lib/ai-config', () => ({
  AI_MODEL: 'test-model',
  SAFETY_SETTINGS: [],
}));

const { POST: blurbPOST } = await import('@/app/api/publishing/blurb/route');
const { POST: marketingPOST } = await import('@/app/api/publishing/marketing/route');
const { POST: loglinePOST } = await import('@/app/api/publishing/logline/route');
const { POST: queryLetterPOST } = await import('@/app/api/publishing/query-letter/route');

function makeRequest(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/publishing/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = { title: 'The Glass Garden', genre: 'Fantasy', synopsis: 'A girl finds a door.' };

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  mockGenerateContent.mockReset();
  mockGenerateContent.mockResolvedValue({ text: 'GENERATED OUTPUT' });
  mockEnforceAiQuota.mockReset();
  mockEnforceAiQuota.mockResolvedValue(null);
});

describe('publishing routes — AI quota + input caps', () => {
  it('returns 429 quota_exceeded when the monthly AI allowance is used up', async () => {
    const { err } = await import('@/lib/api-response');
    mockEnforceAiQuota.mockResolvedValue(
      err('quota_exceeded', 'Your monthly AI allowance is used up.', 429),
    );

    const res = await blurbPOST(makeRequest('blurb', VALID));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('quota_exceeded');
    // The upstream model must never be called once the quota is exhausted.
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('rejects an oversized short field (title > 300 chars) with 400', async () => {
    const res = await blurbPOST(
      makeRequest('blurb', { ...VALID, title: 'x'.repeat(301) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('validation_failed');
    expect(body.error).toMatch(/title/);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('rejects an oversized long field (synopsis > 30KB) with 400', async () => {
    const res = await marketingPOST(
      makeRequest('marketing', { ...VALID, synopsis: 'y'.repeat(30_001) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('validation_failed');
    expect(body.error).toMatch(/synopsis/);
  });

  it('rejects a non-string prompt field with 400', async () => {
    const res = await loglinePOST(
      makeRequest('logline', { ...VALID, protagonistName: { $inject: true } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('validation_failed');
  });
});

describe('POST /api/publishing/blurb', () => {
  it('rejects missing title/genre', async () => {
    const res = await blurbPOST(makeRequest('blurb', { genre: 'Fantasy' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/);
  });

  it('returns typed ai_not_configured when key missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await blurbPOST(makeRequest('blurb', VALID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.details?.reason).toBe('ai_not_configured');
    expect(body.details?.provider).toBe('gemini');
  });

  it('returns generated blurb on success', async () => {
    const res = await blurbPOST(makeRequest('blurb', { ...VALID, language: 'English' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blurb).toBe('GENERATED OUTPUT');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('injects the locale block for Spanish', async () => {
    await blurbPOST(makeRequest('blurb', { ...VALID, language: 'Spanish' }));
    const prompt = mockGenerateContent.mock.calls[0][0].contents as string;
    expect(prompt).toMatch(/español/i);
  });
});

describe('POST /api/publishing/marketing', () => {
  it('rejects missing fields', async () => {
    const res = await marketingPOST(makeRequest('marketing', { title: 'X' }));
    expect(res.status).toBe(400);
  });

  it('returns typed ai_not_configured when key missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await marketingPOST(makeRequest('marketing', VALID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.details?.reason).toBe('ai_not_configured');
  });

  it('returns generated marketing copy on success', async () => {
    const res = await marketingPOST(makeRequest('marketing', VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.marketing).toBe('GENERATED OUTPUT');
  });
});

describe('POST /api/publishing/logline', () => {
  it('rejects missing fields', async () => {
    const res = await loglinePOST(makeRequest('logline', {}));
    expect(res.status).toBe(400);
  });

  it('returns typed ai_not_configured when key missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await loglinePOST(makeRequest('logline', VALID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.details?.reason).toBe('ai_not_configured');
  });

  it('returns generated logline on success', async () => {
    const res = await loglinePOST(makeRequest('logline', VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logline).toBe('GENERATED OUTPUT');
  });
});

describe('POST /api/publishing/query-letter (reliability upgrade)', () => {
  it('returns typed ai_not_configured when key missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await queryLetterPOST(
      makeRequest('query-letter', VALID),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.details?.reason).toBe('ai_not_configured');
    expect(body.details?.provider).toBe('gemini');
  });

  it('retries on a transient 503 then succeeds', async () => {
    mockGenerateContent.mockReset();
    mockGenerateContent
      .mockRejectedValueOnce({ status: 503, message: 'UNAVAILABLE' })
      .mockResolvedValueOnce({ text: 'QUERY LETTER' });
    const res = await queryLetterPOST(makeRequest('query-letter', VALID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.letter).toBe('QUERY LETTER');
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});
