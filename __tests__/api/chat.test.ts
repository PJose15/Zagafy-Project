import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock rate-limit to always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock @google/genai
const mockSendMessage = vi.fn();
const mockChatsCreate = vi.fn().mockReturnValue({ sendMessage: mockSendMessage });
vi.mock('@google/genai', () => {
  const MockGoogleGenAI = class {
    chats = { create: mockChatsCreate };
  };
  return {
    GoogleGenAI: MockGoogleGenAI,
    Content: {},
    Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
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

const { POST } = await import('@/app/api/chat/route');

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockSendMessage.mockReset();
    mockChatsCreate.mockClear();
    mockChatsCreate.mockReturnValue({ sendMessage: mockSendMessage });
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
    const res = await POST(makeRequest({ userInput: 'hello' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/language/);
  });

  it('rejects payload exceeding 500KB', async () => {
    const res = await POST(
      makeRequest({
        userInput: 'hello',
        language: 'English',
        storyContext: 'x'.repeat(500_001),
      })
    );
    expect(res.status).toBe(413);
  });

  it('returns 500 when GEMINI_API_KEY is not set', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await POST(
      makeRequest({ userInput: 'hello', language: 'English', storyContext: '' })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/GEMINI_API_KEY/);
    expect(body.details?.reason).toBe('ai_not_configured');
  });

  it('returns structured normal response on success', async () => {
    const structured = {
      contextUsed: ['Elena (protagonist)'],
      informationGaps: ['None'],
      conflictsDetected: ['None'],
      recommendation: 'Elena should proceed carefully.',
      alternatives: ['Talk to Marco'],
      generatedText: '',
      confidenceNotes: ['[From context] Elena is the protagonist'],
    };
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(structured),
    });

    const res = await POST(
      makeRequest({
        userInput: 'What should happen next?',
        language: 'English',
        storyContext: 'Chapter 1...',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toContain('Elena should proceed carefully');
    expect(body.isBlockedMode).toBe(false);
    expect(body.structured).toBeDefined();
    expect(body.structured.recommendation).toBe('Elena should proceed carefully.');
  });

  it('returns blocked response when safety filter triggers', async () => {
    mockSendMessage.mockResolvedValue({
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
    expect(body.blocked).toBe(true);
  });

  it('appends truncation notice on MAX_TOKENS', async () => {
    const structured = {
      contextUsed: [],
      informationGaps: [],
      conflictsDetected: [],
      recommendation: 'partial',
      alternatives: [],
      generatedText: '',
      confidenceNotes: [],
    };
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'MAX_TOKENS' }],
      text: JSON.stringify(structured),
    });

    const res = await POST(
      makeRequest({
        userInput: 'test',
        language: 'English',
        storyContext: '',
      })
    );
    const body = await res.json();
    expect(body.text).toContain('truncated');
  });

  it('uses multi-turn chat with history', async () => {
    const structured = {
      contextUsed: [],
      informationGaps: [],
      conflictsDetected: [],
      recommendation: 'response',
      alternatives: [],
      generatedText: '',
      confidenceNotes: [],
    };
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(structured),
    });

    await POST(
      makeRequest({
        userInput: 'continue',
        language: 'English',
        storyContext: '',
        chatHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
      })
    );

    // Verify chats.create was called (multi-turn)
    expect(mockChatsCreate).toHaveBeenCalled();
    const createArgs = mockChatsCreate.mock.calls[0][0];
    expect(createArgs.history).toHaveLength(2);
    expect(createArgs.history[0].role).toBe('user');
    expect(createArgs.history[1].role).toBe('model');
  });

  it('uses blocked mode config when isBlockedRequest is true', async () => {
    const structured = {
      currentState: 'Story is at chapter 3',
      diagnosis: 'Plot block',
      nextPaths: [{ label: 'Continue', description: 'Keep going' }],
      bestRecommendation: 'Try writing the next scene',
      sceneStarter: '',
    };
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(structured),
    });

    const res = await POST(
      makeRequest({
        userInput: "I'm blocked",
        language: 'English',
        storyContext: '',
        isBlockedRequest: true,
      })
    );
    const body = await res.json();
    expect(body.isBlockedMode).toBe(true);
    expect(body.structured.diagnosis).toBe('Plot block');
  });

  it('validates response against known entities', async () => {
    const structured = {
      contextUsed: ['NonExistentCharacter'],
      informationGaps: [],
      conflictsDetected: [],
      recommendation: 'Something about NonExistentCharacter',
      alternatives: [],
      generatedText: '',
      confidenceNotes: [],
    };
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(structured),
    });

    const res = await POST(
      makeRequest({
        userInput: 'test',
        language: 'English',
        storyContext: '',
        knownEntities: {
          characters: ['Elena', 'Marco'],
          chapters: ['Chapter 1'],
          locations: ['Castle'],
        },
      })
    );
    const body = await res.json();
    // Validation should add warnings about unknown references
    expect(body.structured.confidenceNotes.some((n: string) => n.includes('[Validation]'))).toBe(true);
  });

  it('falls back to legacy text format on invalid JSON', async () => {
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: 'This is plain text, not JSON',
    });

    const res = await POST(
      makeRequest({
        userInput: 'test',
        language: 'English',
        storyContext: '',
      })
    );
    const body = await res.json();
    expect(body.text).toBe('This is plain text, not JSON');
    expect(body.structured).toBeUndefined();
  });

  it('includes truncation notice when chatHistory exceeds MAX_HISTORY_TURNS*2', async () => {
    const structured = {
      contextUsed: [],
      informationGaps: [],
      conflictsDetected: [],
      recommendation: 'ok',
      alternatives: [],
      generatedText: '',
      confidenceNotes: [],
    };
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(structured),
    });

    // Create 30 history items (exceeds MAX_HISTORY_TURNS * 2 = 20)
    const longHistory = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }));

    await POST(
      makeRequest({
        userInput: 'test',
        language: 'English',
        storyContext: '',
        chatHistory: longHistory,
      })
    );

    expect(mockSendMessage).toHaveBeenCalled();
    const sentMessage = mockSendMessage.mock.calls[0][0].message;
    expect(sentMessage).toContain('[Note: This conversation has 30 messages');
    expect(sentMessage).toContain('older messages were trimmed');
  });

  it('handles legacy string chat history format', async () => {
    const structured = {
      contextUsed: [],
      informationGaps: [],
      conflictsDetected: [],
      recommendation: 'ok',
      alternatives: [],
      generatedText: '',
      confidenceNotes: [],
    };
    mockSendMessage.mockResolvedValue({
      candidates: [{ finishReason: 'STOP' }],
      text: JSON.stringify(structured),
    });

    await POST(
      makeRequest({
        userInput: 'test',
        language: 'English',
        storyContext: '',
        chatHistory: ['User: Hello', 'Assistant: Hi there'],
      })
    );

    expect(mockChatsCreate).toHaveBeenCalled();
    const createArgs = mockChatsCreate.mock.calls[0][0];
    expect(createArgs.history).toHaveLength(2);
    expect(createArgs.history[0].role).toBe('user');
    expect(createArgs.history[1].role).toBe('model');
  });
});
