import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { enforceAiQuota } from '@/lib/ai-quota';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { withRetry } from '@/lib/ai/retry';
import { buildLocaleBlock } from '@/lib/prompts/locale';
import { validatePublishingInput, shortField, longField } from '@/lib/publishing-validation';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/publishing/blurb', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;
  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  const quotaResponse = await enforceAiQuota(authResult, { requestId });
  if (quotaResponse) return quotaResponse;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err('validation_failed', 'Invalid JSON body', 400, undefined, { requestId });
    }
    const invalid = validatePublishingInput(
      body,
      [
        shortField('title', true),
        shortField('genre', true),
        longField('synopsis'),
        shortField('protagonistName'),
        shortField('tone'),
        shortField('language'),
      ],
      { requestId },
    );
    if (invalid) return invalid;
    const { title, genre, synopsis, protagonistName, tone, language } = body as {
      title: string;
      genre: string;
      synopsis?: string;
      protagonistName?: string;
      tone?: string;
      language?: string;
    };

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

Write a back-cover blurb (book description / jacket copy) for a novel, the kind that appears on the back cover and on a retailer's product page.
Title: ${title}
Genre: ${genre}
Synopsis: ${synopsis || 'Not provided'}
Protagonist: ${protagonistName || 'Not specified'}
Tone: ${tone || 'Match the genre'}

Write 120-180 words of compelling, market-ready copy that hooks the reader and conveys stakes and atmosphere WITHOUT spoiling the ending (this is a blurb, not a synopsis). Use vivid, evocative language. Open with a hook line, build tension, and end on an intriguing question or cliffhanger. Do not include the word count, headings, or commentary — return only the blurb prose.`;

    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: AI_MODEL,
          contents: prompt,
          config: { safetySettings: SAFETY_SETTINGS, temperature: 0.8, maxOutputTokens: 1024 },
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

    return ok({ blurb: response.text || '' });
  } catch (error: unknown) {
    log.error('Blurb generation error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to generate blurb', status);
  }
}
