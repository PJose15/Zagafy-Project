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
    chat: { temperature: 0.3, maxOutputTokens: 4096 },
    chatBlocked: { temperature: 0.5, maxOutputTokens: 4096 },
    audit: { temperature: 0.1, maxOutputTokens: 2048 },
    microPrompt: { temperature: 0.7, maxOutputTokens: 1024 },
  },
}));

vi.mock('@/lib/prompts/writing-assistant', () => ({
  buildWritingAssistantPrompt: vi.fn().mockReturnValue('system-prompt'),
}));

const { POST } = await import('@/app/api/audit/route');

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/audit', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockGenerateContent.mockReset();
  });

  it('rejects missing userInput', async () => {
    const res = await POST(makeRequest({ language: 'English' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/userInput/);
  });

  it('rejects empty userInput', async () => {
    const res = await POST(makeRequest({ userInput: '  ', language: 'English' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing language', async () => {
    const res = await POST(makeRequest({ userInput: 'Check this scene' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/language/);
  });

  it('rejects payload exceeding 500KB', async () => {
    const res = await POST(
      makeRequest({
        userInput: 'x',
        language: 'English',
        storyContext: 'x'.repeat(500_001),
      })
    );
    expect(res.status).toBe(413);
  });

  it('returns structured JSON audit result on success', async () => {
    const auditResult = {
      status: 'Warnings',
      risks: [{ level: 'Medium', description: 'Timeline gap', affectedElements: ['ch3'] }],
      suggestedCorrections: ['Add transition scene'],
      safeVersion: 'A safer version of the scene...',
    };

    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(auditResult),
    });

    const res = await POST(
      makeRequest({
        userInput: 'John meets Mary at the park',
        language: 'English',
        storyContext: 'Chapter 1...',
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('Warnings');
    expect(body.risks).toHaveLength(1);
    expect(body.risks[0].level).toBe('Medium');
    expect(body.suggestedCorrections).toHaveLength(1);
    expect(typeof body.safeVersion).toBe('string');
  });

  it('degrades to a clear result (not a hard 502) when Gemini returns invalid JSON', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: 'not valid json {{{',
    });

    const res = await POST(
      makeRequest({
        userInput: 'test',
        language: 'English',
        storyContext: '',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('Clear');
    expect(body.risks).toEqual([]);
  });

  it('sends prompt with CHARACTER LOGIC and FORESHADOWING COHERENCE dimensions', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify({ status: 'Clear', risks: [], suggestedCorrections: [], safeVersion: '' }),
    });

    await POST(
      makeRequest({
        userInput: 'Elena confronts Marco',
        language: 'English',
        storyContext: 'Some story context',
      })
    );

    expect(mockGenerateContent).toHaveBeenCalled();
    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.contents).toContain('CHARACTER LOGIC');
    expect(callArgs.contents).toContain('FORESHADOWING COHERENCE');
  });

  it('returns fallback when safety filter triggers', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY' }],
      text: '',
    });

    const res = await POST(
      makeRequest({
        userInput: 'test',
        language: 'English',
        storyContext: '',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('Clear');
  });
});
