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
  const log = createRouteLogger({ endpoint: '/api/publishing/marketing', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;
  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const { title, genre, synopsis, tones, themes, language } = await req.json();
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

Generate a complete Amazon / KDP marketing copy package for a self-published novel.
Title: ${title}
Genre: ${genre}
Synopsis: ${synopsis || 'Not provided'}
Tones: ${tones || 'Not specified'}
Themes: ${themes || 'Not specified'}

Produce, with clear plain-text section labels (no markdown fences):
1. PRODUCT DESCRIPTION — 150-200 words of retail sales copy optimized for the Amazon product page (hook, stakes, no spoilers).
2. EDITORIAL HOOK — one punchy sentence (under 20 words) for the top of the listing.
3. KEYWORDS — 7 search keyword phrases buyers in this genre would type, comma-separated.
4. CATEGORIES — 3 recommended Amazon/KDP browse categories.
5. A+ BULLET POINTS — 4 short bullet selling points (benefit-driven).

Use persuasive, genre-appropriate marketing language. Keep it ready to paste into KDP.`;

    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: AI_MODEL,
          contents: prompt,
          config: { safetySettings: SAFETY_SETTINGS, temperature: 0.8, maxOutputTokens: 2048 },
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

    return ok({ marketing: response.text || '' });
  } catch (error: unknown) {
    log.error('Marketing copy error', error);
    return err('internal_error', 'Failed to generate marketing copy', 500);
  }
}
