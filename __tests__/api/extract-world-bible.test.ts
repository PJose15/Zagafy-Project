import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock rate-limit to always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock @google/genai
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  const MockGoogleGenAI = class {
    models = { generateContent: mockGenerateContent };
  };
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
    },
    FinishReason: {
      SAFETY: 'SAFETY',
      PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
      BLOCKLIST: 'BLOCKLIST',
      MAX_TOKENS: 'MAX_TOKENS',
    },
  };
});

vi.mock('@/lib/ai-config', () => ({
  AI_MODEL: 'test-model',
  SAFETY_SETTINGS: [],
  THINKING_CONFIG: { thinkingBudget: 0 },
  GEMINI_TIMEOUT_MS: 25000,
  AI_CONFIG: {
    worldBible: { temperature: 0.1, maxOutputTokens: 8192 },
  },
}));

const { POST } = await import('@/app/api/extract-world-bible/route');

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/extract-world-bible', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/extract-world-bible', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockGenerateContent.mockReset();
  });

  it('rejects missing chapters field', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/chapters/);
  });

  it('rejects empty chapters array', async () => {
    const res = await POST(makeRequest({ chapters: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects chapter without title', async () => {
    const res = await POST(makeRequest({ chapters: [{ content: 'some text' }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/title/i);
  });

  it('rejects chapter without content', async () => {
    const res = await POST(makeRequest({ chapters: [{ title: 'Ch1', content: '' }] }));
    expect(res.status).toBe(400);
  });

  it('rejects oversized payload', async () => {
    const res = await POST(
      makeRequest({
        chapters: [{ title: 'Ch1', content: 'x'.repeat(500_001) }],
      }),
    );
    expect(res.status).toBe(413);
  });

  it('returns 500 when API key is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await POST(
      makeRequest({ chapters: [{ title: 'Ch1', content: 'The kingdom of Ardent...' }] }),
    );
    expect(res.status).toBe(500);
  });

  it('returns extracted sections on success', async () => {
    const geminiResult = {
      sections: [
        { category: 'geography', title: 'Kingdom of Ardent', content: 'A vast kingdom...' },
        { category: 'history', title: 'The Great War', content: 'Centuries ago...' },
      ],
    };

    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(geminiResult),
    });

    const res = await POST(
      makeRequest({ chapters: [{ title: 'Ch1', content: 'The kingdom of Ardent sprawls across...' }] }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toHaveLength(2);
    expect(body.sections[0].category).toBe('geography');
    expect(body.sections[0].source).toBe('ai-extracted');
    expect(body.sections[0].canonStatus).toBe('draft');
    expect(body.sections[0].id).toBeTruthy();
    expect(body.sections[0].lastUpdated).toBeTruthy();
  });

  it('filters out sections with invalid categories', async () => {
    const geminiResult = {
      sections: [
        { category: 'geography', title: 'Valid', content: 'Content' },
        { category: 'made-up-category', title: 'Invalid', content: 'Content' },
        { category: 'politics', title: 'Also Valid', content: 'Content' },
      ],
    };

    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(geminiResult),
    });

    const res = await POST(
      makeRequest({ chapters: [{ title: 'Ch1', content: 'Some text...' }] }),
    );

    const body = await res.json();
    expect(body.sections).toHaveLength(2);
    expect(body.sections.map((s: { category: string }) => s.category)).toEqual(['geography', 'politics']);
  });

  it('returns empty sections on safety block', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY' }],
      text: '',
    });

    const res = await POST(
      makeRequest({ chapters: [{ title: 'Ch1', content: 'Dark content...' }] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toEqual([]);
  });

  it('degrades to empty sections (not a hard 502) on unrepairable JSON from Gemini', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: 'not valid json {{{',
    });

    const res = await POST(
      makeRequest({ chapters: [{ title: 'Ch1', content: 'Some text...' }] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toEqual([]);
  });

  it('returns empty sections when response text is empty', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: '',
    });

    const res = await POST(
      makeRequest({ chapters: [{ title: 'Ch1', content: 'Text...' }] }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toEqual([]);
  });
});
