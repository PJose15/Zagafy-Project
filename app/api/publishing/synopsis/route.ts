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
  const log = createRouteLogger({ endpoint: '/api/publishing/synopsis', requestId });
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
        shortField('genre'),
        longField('synopsis'),
        longField('chapters'),
        longField('characters'),
        shortField('language'),
      ],
      { requestId },
    );
    if (invalid) return invalid;
    const { length, title, genre, synopsis, chapters, characters, language } = body as {
      length?: unknown;
      title: string;
      genre?: string;
      synopsis?: string;
      chapters?: string;
      characters?: string;
      language?: string;
    };
    if (!length) {
      return err('validation_failed', 'Missing required fields: length', 400, undefined, { requestId });
    }
    if (length !== '1-page' && length !== '5-page') {
      return err('validation_failed', 'Length must be "1-page" or "5-page"', 400, undefined, { requestId });
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
    const wordTarget = length === '1-page' ? '500-600' : '2500-3000';
    const prompt = `${buildLocaleBlock(lang)}

Generate a professional ${length} synopsis for a novel.
Title: ${title}
Genre: ${genre || 'Not specified'}
Brief Synopsis: ${synopsis || 'Not provided'}
Characters: ${characters || 'Not provided'}
Chapter Summaries: ${chapters || 'Not provided'}

Write a compelling, industry-standard ${length} synopsis (approximately ${wordTarget} words).
Include: main character introduction, inciting incident, major plot points, climax, and resolution.
Reveal the ending — this is a synopsis, not a blurb.`;

    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: AI_MODEL,
          contents: prompt,
          config: { safetySettings: SAFETY_SETTINGS, temperature: 0.7, maxOutputTokens: length === '5-page' ? 4096 : 2048 },
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

    return ok({ synopsis: response.text || '' });
  } catch (error: unknown) {
    log.error('Synopsis generation error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to generate synopsis', status);
  }
}
