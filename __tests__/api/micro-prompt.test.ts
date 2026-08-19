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
}));

vi.mock('@/lib/prompts/micro-prompt', async () => {
  const actual = await vi.importActual<typeof import('@/lib/prompts/micro-prompt')>('@/lib/prompts/micro-prompt');
  return {
    buildMicroPromptSystemPrompt: vi.fn().mockReturnValue('system'),
    buildMicroPromptContent: vi.fn().mockReturnValue('content'),
    validateMicroPromptResponse: actual.validateMicroPromptResponse,
  };
});

const { POST } = await import('@/app/api/micro-prompt/route');

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/micro-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/micro-prompt', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockGenerateContent.mockReset();
  });

  it('rejects missing recentText', async () => {
    const res = await POST(makeRequest({ genre: 'Fantasy' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/recentText/);
  });

  it('rejects recentText shorter than 20 characters', async () => {
    const res = await POST(makeRequest({ recentText: 'Too short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/20 characters/);
  });

  it('returns 500 when GEMINI_API_KEY is not set', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await POST(
      makeRequest({ recentText: 'A long enough passage to meet the minimum character requirement for this endpoint' })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/API key/);
  });

  it('returns validated prompt on success', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: 'What does she fear most about opening the door right now?',
    });

    const res = await POST(
      makeRequest({
        recentText: 'She walked through the dark corridor, her footsteps echoing off the stone walls.',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe('What does she fear most about opening the door right now?');
  });

  it('returns empty prompt when validation fails (garbage output)', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: 'What?',
    });

    const res = await POST(
      makeRequest({
        recentText: 'She walked through the dark corridor, her footsteps echoing off the stone walls.',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe('');
  });

  it('returns empty prompt when safety filter triggers', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'SAFETY' }],
      text: '',
    });

    const res = await POST(
      makeRequest({
        recentText: 'She walked through the dark corridor, her footsteps echoing off the stone walls.',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe('');
  });

  it('passes an output-token budget and disables thinking so the prompt is not starved', async () => {
    mockGenerateContent.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: 'What does she feel as her footsteps echo through the dark corridor?',
    });

    await POST(
      makeRequest({
        recentText: 'She walked through the dark corridor, her footsteps echoing off the stone walls.',
      })
    );

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.maxOutputTokens).toBe(256);
    // Thinking must be disabled — otherwise gemini-2.5-flash spends the budget
    // thinking and returns an empty prompt.
    expect(callArgs.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('returns empty prompt silently on Gemini 429 rate limit', async () => {
    mockGenerateContent.mockRejectedValue({ status: 429, message: 'Rate limited' });

    const res = await POST(
      makeRequest({
        recentText: 'She walked through the dark corridor, her footsteps echoing off the stone walls.',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe('');
  });
});
