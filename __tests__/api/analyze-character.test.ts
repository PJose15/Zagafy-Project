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
    characterAnalysis: { temperature: 0.3, maxOutputTokens: 2048 },
  },
}));

vi.mock('@/lib/prompts/character-analysis', () => ({
  buildCharacterAnalysisSystemPrompt: vi.fn().mockReturnValue('system-prompt'),
  buildCharacterAnalysisPrompt: vi.fn().mockReturnValue('analysis-prompt'),
}));

const { POST } = await import('@/app/api/analyze-character/route');

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/analyze-character', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analyze-character', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockGenerateContent.mockReset();
  });

  it('rejects missing character object', async () => {
    const res = await POST(makeRequest({ language: 'English' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/character/);
  });

  it('rejects non-object character', async () => {
    const res = await POST(makeRequest({ character: 'string', language: 'English' }));
    expect(res.status).toBe(400);
  });

  it('rejects character without name', async () => {
    const res = await POST(
      makeRequest({ character: { id: '1', role: 'hero' }, language: 'English' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/character\.name/);
  });

  it('rejects empty character name', async () => {
    const res = await POST(
      makeRequest({ character: { name: '  ' }, language: 'English' })
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing language', async () => {
    const res = await POST(
      makeRequest({ character: { name: 'Alice', role: 'protagonist' } })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/language/);
  });

  it('returns analysis text on success', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: '## Character Analysis\nAlice is consistent.',
    });

    const res = await POST(
      makeRequest({
        character: { name: 'Alice', role: 'protagonist' },
        language: 'English',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toContain('Alice');
  });

  it('returns fallback text on safety block', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY' }],
      text: '',
    });

    const res = await POST(
      makeRequest({
        character: { name: 'Alice', role: 'villain' },
        language: 'English',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toMatch(/could not analyze/);
  });

  it('appends truncation notice on MAX_TOKENS', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'MAX_TOKENS' }],
      text: 'partial analysis',
    });

    const res = await POST(
      makeRequest({
        character: { name: 'Alice', role: 'protagonist' },
        language: 'English',
      })
    );
    const body = await res.json();
    expect(body.analysis).toContain('truncated');
  });
});
