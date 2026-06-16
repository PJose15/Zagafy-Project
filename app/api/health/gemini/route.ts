import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { AI_MODEL } from '@/lib/ai-config';
import { ok, err } from '@/lib/api-response';

export const maxDuration = 30;

/**
 * Diagnostic endpoint: confirms GEMINI_API_KEY is set and reachable.
 * Hit this in your browser when extract-world-bible is failing —
 * the response tells you exactly what's wrong with the Gemini setup.
 *
 * Note: the envelope's `ok: true | false` indicates the request was
 * processed; the body's `geminiReachable` indicates the upstream probe
 * succeeded. They are distinct concerns.
 */
export async function GET(req: NextRequest) {
  // Gated like the other health probes: in production HEALTH_TOKEN must be set
  // and matched, so this billable Gemini probe can't be hit anonymously.
  const required = process.env.HEALTH_TOKEN ?? '';
  if (process.env.NODE_ENV === 'production' && !required) {
    return err('upstream_unavailable', 'Health probe disabled. Set HEALTH_TOKEN in production to enable.', 503);
  }
  if (required && req.headers.get('x-health-token') !== required) {
    return err('forbidden', 'Forbidden', 403);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const keyPresent = Boolean(apiKey);

  if (!keyPresent) {
    return err('internal_error', 'GEMINI_API_KEY is not set in this environment.', 500, {
      keyPresent: false,
      model: AI_MODEL,
      hint: 'Set GEMINI_API_KEY in your hosting provider (Vercel project settings / AI Studio secrets / .env.local for local dev) and redeploy.',
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: 'Reply with the single word: OK',
      config: {
        temperature: 0,
        maxOutputTokens: 32,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text?.trim() ?? '';
    const finishReason = response.candidates?.[0]?.finishReason ?? null;

    return ok({
      geminiReachable: text.length > 0,
      keyPresent: true,
      model: AI_MODEL,
      finishReason,
      sampleResponse: text.slice(0, 100),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : 'UnknownError';
    return err('upstream_unavailable', message, 500, {
      keyPresent: true,
      model: AI_MODEL,
      errorName: name,
    });
  }
}
