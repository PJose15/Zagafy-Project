import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock rate-limit — controllable per test.
const mockRateLimit = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

// Mock @google/genai
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  const MockGoogleGenAI = class {
    models = { generateContent: mockGenerateContent };
  };
  return {
    GoogleGenAI: MockGoogleGenAI,
    FinishReason: {
      SAFETY: 'SAFETY',
      PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
      BLOCKLIST: 'BLOCKLIST',
      MAX_TOKENS: 'MAX_TOKENS',
    },
    Type: {
      ARRAY: 'ARRAY',
      OBJECT: 'OBJECT',
      STRING: 'STRING',
    },
  };
});

vi.mock('@/lib/ai-config', () => ({
  AI_MODEL: 'test-model',
  SAFETY_SETTINGS: [],
  THINKING_CONFIG: { thinkingBudget: 0 },
  GEMINI_TIMEOUT_MS: 25000,
  AI_CONFIG: {
    storyCoach: { temperature: 0.3, maxOutputTokens: 4096 },
  },
}));

vi.mock('@/lib/prompts/story-coach', () => ({
  buildStoryCoachPrompt: vi.fn().mockReturnValue('system-prompt'),
  buildStoryCoachContent: vi.fn().mockReturnValue('content'),
}));

const { POST } = await import('@/app/api/story-coach/route');

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/story-coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_CHAPTER = 'a'.repeat(60);

function insight(over: Record<string, unknown> = {}) {
  return {
    lens: 'tension',
    observation: 'The stakes are unclear here.',
    suggestion: 'Show what the protagonist stands to lose.',
    priority: 'high',
    ...over,
  };
}

describe('POST /api/story-coach', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockGenerateContent.mockReset();
    mockRateLimit.mockReset();
    mockRateLimit.mockResolvedValue(null);
  });

  it('returns 400 when chapterContent is missing or too short', async () => {
    const res = await POST(makeRequest({ chapterContent: 'too short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('at least 50 characters');
  });

  it('short-circuits when rate limited', async () => {
    const limitResponse = NextResponse.json({ error: 'rate limited' }, { status: 429 });
    mockRateLimit.mockResolvedValue(limitResponse);
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    expect(res.status).toBe(429);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('returns 500 when GEMINI_API_KEY is not set', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    expect(res.status).toBe(500);
  });

  it('returns validated insights on a well-formed response', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify([insight(), insight({ lens: 'pacing', priority: 'low' })]),
    });
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.insights).toHaveLength(2);
    expect(body.insights[0].lens).toBe('tension');
    expect(body.insights[0].id).toBeTruthy();
  });

  it('filters out insights with an invalid lens or priority', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify([
        insight(),
        insight({ lens: 'not-a-lens' }),
        insight({ priority: 'urgent' }),
        insight({ observation: '' }),
      ]),
    });
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    const body = await res.json();
    expect(body.insights).toHaveLength(1);
  });

  it('caps observation and suggestion length to guard against over-generation', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify([insight({ observation: 'x'.repeat(1000), suggestion: 'y'.repeat(1000) })]),
    });
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    const body = await res.json();
    expect(body.insights[0].observation.length).toBe(500);
    expect(body.insights[0].suggestion.length).toBe(500);
  });

  it('returns an empty list with blocked flag on a safety finishReason', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY' }],
      text: '',
    });
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    const body = await res.json();
    expect(body.insights).toEqual([]);
    expect(body.blocked).toBe(true);
  });

  it('returns parseError on malformed JSON instead of crashing', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: 'this is not json',
    });
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.insights).toEqual([]);
    expect(body.parseError).toBe(true);
  });

  it('disables thinking and sets the coach output-token budget', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: '[]',
    });
    await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(callArgs.config.maxOutputTokens).toBe(4096);
  });

  it('returns empty insights with rateLimited flag when the provider 429s', async () => {
    mockGenerateContent.mockRejectedValue({ status: 429, message: 'Rate limited' });
    const res = await POST(makeRequest({ chapterContent: VALID_CHAPTER }));
    const body = await res.json();
    expect(body.insights).toEqual([]);
    expect(body.rateLimited).toBe(true);
  });
});
