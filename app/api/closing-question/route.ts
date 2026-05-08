import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';

const FALLBACK_QUESTIONS = [
  'What surprised you about what you wrote today?',
  'Which character felt most alive in this session?',
  'What would your protagonist say about today\'s work?',
  'Did you discover something unexpected about your story?',
  'What scene are you most curious to write next?',
];

function getRandomFallback(): string {
  return FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/closing-question', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { storyContext, wordsWritten } = body;

    if (typeof wordsWritten !== 'number') {
      return err('validation_failed', 'wordsWritten is required and must be a number', 400);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      log.warn('degraded', { degradationReason: 'gemini_key_missing' });
      return ok({ question: getRandomFallback(), degraded: true, degradationReason: 'gemini_key_missing' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = 'You are a writing mentor. Generate ONE reflective question (max 20 words) about the writer\'s session. Be warm, specific, and thought-provoking. Output ONLY the question.';

    const userMessage = `The writer wrote ${wordsWritten} words this session.${
      storyContext && typeof storyContext === 'string'
        ? ` Recent context: ${storyContext.slice(0, 500)}`
        : ''
    }`;

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: AI_MODEL,
        config: {
          temperature: 0.7,
          maxOutputTokens: 80,
          safetySettings: SAFETY_SETTINGS,
          systemInstruction: systemPrompt,
        },
        contents: userMessage,
      }),
    );

    const question = response.text?.trim();

    if (!question) {
      log.warn('degraded', { degradationReason: 'empty_response' });
      return ok({ question: getRandomFallback(), degraded: true, degradationReason: 'empty_response' });
    }

    return ok({ question });
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 429) {
      return err('rate_limited', 'Rate limited by AI provider', 429);
    }
    // On any error, return a fallback question rather than failing the
    // ritual. The flag lets the UI show a subtle "older voice answers" hint.
    const message = error instanceof Error ? error.message : String(error);
    const reason = /timeout|timed out|ETIMEDOUT/i.test(message) ? 'gemini_timeout' : 'gemini_error';
    log.warn('degraded', { degradationReason: reason, upstreamMessage: message });
    return ok({ question: getRandomFallback(), degraded: true, degradationReason: reason });
  }
}
