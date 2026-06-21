import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { withRetry } from '@/lib/ai/retry';
import { buildLocaleBlock } from '@/lib/prompts/locale';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/publishing/comp-titles', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;
  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const { title, genre, tones, themes, language } = await req.json();
    if (!title || !genre) {
      return err('validation_failed', 'Missing required fields: title, genre', 400);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err(
        'internal_error',
        'The AI publishing tools are not configured. Set GEMINI_API_KEY in this environment to enable them.',
        500,
        { reason: 'ai_not_configured', provider: 'gemini' },
      );
    }

    const lang = language || 'English';
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `${buildLocaleBlock(lang)}

Suggest 3 comparable published titles (comp titles) for a novel being queried to literary agents.
Title: ${title}
Genre: ${genre}
Tones: ${tones || 'Not specified'}
Themes: ${themes || 'Not specified'}

For each comp title, provide:
1. The book title and author
2. Publication year
3. A 2-3 sentence rationale explaining how this novel compares in terms of genre, tone, themes, audience, and narrative style.

Choose well-known, commercially successful titles published within the last 10 years when possible.

You MUST respond with ONLY a valid JSON array, no markdown fences. Format:
[
  {
    "title": "Book Title",
    "author": "Author Name",
    "year": 2023,
    "rationale": "Explanation of comparison..."
  }
]

Respond in ${lang} for the rationale text.`;

    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: AI_MODEL,
          contents: prompt,
          config: { safetySettings: SAFETY_SETTINGS, temperature: 0.7, maxOutputTokens: 2048 },
        }),
      {
        onAttempt: ({ attempt, willRetry, nextDelayMs, err: attemptErr }) => {
          if (willRetry) {
            log.warn('Gemini transient failure, retrying', {
              attempt,
              nextDelayMs,
              upstreamMessage: attemptErr instanceof Error ? attemptErr.message : String(attemptErr),
            });
          }
        },
      },
    );

    const raw = response.text || '[]';
    let compTitles;
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      compTitles = JSON.parse(cleaned);
    } catch {
      compTitles = [{ title: 'Parse error', author: '', year: 0, rationale: raw }];
    }

    return ok({ compTitles });
  } catch (error: unknown) {
    log.error('Comp titles error', error);
    return err('internal_error', 'Failed to generate comp titles', 500);
  }
}
