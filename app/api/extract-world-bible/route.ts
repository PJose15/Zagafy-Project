import { NextRequest } from 'next/server';
import { GoogleGenAI, Type, FinishReason } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { enforceAiQuota } from '@/lib/ai-quota';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG } from '@/lib/ai-config';
import { getErrorStatus, getErrorMessage } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';
import { WORLD_BIBLE_CATEGORIES, type WorldBibleSection } from '@/lib/types/world-bible';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/extract-world-bible', requestId });
  const limited = await rateLimit(req, { maxRequests: 3, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  const quotaResponse = await enforceAiQuota(authResult, { requestId });
  if (quotaResponse) return quotaResponse;

  try {
    const body = await req.json();
    const { chapters } = body;

    if (!Array.isArray(chapters) || chapters.length === 0) {
      return err('validation_failed', 'chapters must be a non-empty array', 400);
    }

    const validChapters = chapters.filter(
      (ch: unknown): ch is { title: string; content: string } =>
        typeof ch === 'object' && ch !== null &&
        typeof (ch as { title?: unknown }).title === 'string' &&
        (ch as { title: string }).title.trim().length > 0 &&
        typeof (ch as { content?: unknown }).content === 'string' &&
        (ch as { content: string }).content.trim().length > 0,
    );

    if (validChapters.length === 0) {
      return err(
        'validation_failed',
        'No chapters with content to extract from. Write chapter text on the Manuscript page first.',
        400,
      );
    }

    const totalSize = validChapters.reduce(
      (sum, ch) => sum + ch.title.length + ch.content.length,
      0,
    );

    if (totalSize > 500_000) {
      return err(
        'validation_failed',
        'Manuscript too long to extract in one pass (>500KB). Try extracting with fewer chapters.',
        413,
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'API key not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });

    const chapterText = validChapters
      .map((ch, i) => `--- Chapter ${i + 1}: ${ch.title} ---\n${ch.content}`)
      .join('\n\n');

    const prompt = `You are a worldbuilding analyst. Extract all worldbuilding details from the following manuscript chapters and organize them into exactly these categories: geography, history, magic-tech, politics, religion-culture, economy, languages, calendar.

For each piece of worldbuilding you find, create a section with:
- category: one of the 8 categories above
- title: a short descriptive title for this piece of lore
- content: detailed description in markdown, citing specific chapters when possible

Only include sections where you found actual content. Do not invent or speculate — extract only what is explicitly stated or strongly implied in the text.

<manuscript>
${chapterText}
</manuscript>`;

    const generateConfig = {
      model: AI_MODEL,
      contents: prompt,
      config: {
        safetySettings: SAFETY_SETTINGS,
        temperature: AI_CONFIG.worldBible.temperature,
        maxOutputTokens: AI_CONFIG.worldBible.maxOutputTokens,
        // Disable "thinking" for gemini-2.5-flash: thinking tokens are billed
        // against maxOutputTokens and can consume the entire budget, leaving
        // an empty or truncated JSON body. Extraction is analytical, not
        // creative — we don't need reasoning tokens here.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING, description: 'One of: geography, history, magic-tech, politics, religion-culture, economy, languages, calendar' },
                  title: { type: Type.STRING },
                  content: { type: Type.STRING, description: 'Markdown content describing this worldbuilding element' },
                },
              },
            },
          },
        },
      },
    };

    // Gemini regularly returns 503 UNAVAILABLE during high-demand periods.
    // withRetry wraps that with exponential backoff + jitter.
    const response = await withRetry(
      () => ai.models.generateContent(generateConfig),
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

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (
      finishReason === FinishReason.SAFETY ||
      finishReason === FinishReason.PROHIBITED_CONTENT ||
      finishReason === FinishReason.BLOCKLIST
    ) {
      return ok({ sections: [] });
    }

    const rawText = response.text;

    if (finishReason === FinishReason.MAX_TOKENS) {
      log.error('response hit MAX_TOKENS; truncated output');
      return err(
        'validation_failed',
        'Manuscript too long to extract in one pass. Try extracting with fewer chapters at a time.',
        413,
      );
    }

    if (!rawText) {
      log.error('empty response text', undefined, { finishReason });
      return err(
        'upstream_unavailable',
        `AI returned an empty response (finish reason: ${finishReason ?? 'unknown'}). Please try again.`,
        502,
      );
    }

    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      log.error('Gemini returned invalid JSON', undefined, { rawTextSample: rawText.slice(0, 500) });
      return err(
        'parse_error',
        'AI returned an invalid response. Please try again, or extract with fewer chapters.',
        502,
      );
    }

    const validCategories = new Set<string>(WORLD_BIBLE_CATEGORIES);
    const now = new Date().toISOString();
    const sections: WorldBibleSection[] = (Array.isArray(result.sections) ? result.sections : [])
      .filter(
        (s: Record<string, unknown>) =>
          typeof s.category === 'string' &&
          validCategories.has(s.category) &&
          typeof s.title === 'string' &&
          s.title.trim() &&
          typeof s.content === 'string' &&
          s.content.trim(),
      )
      .map((s: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        category: s.category as WorldBibleSection['category'],
        title: (s.title as string).trim(),
        content: (s.content as string).trim(),
        source: 'ai-extracted' as const,
        lastUpdated: now,
        canonStatus: 'draft' as const,
      }));

    return ok({ sections });
  } catch (error: unknown) {
    // Log the raw upstream message; the response stays generic so provider
    // internals (key issues, project ids, quota details) never leak to clients.
    const rawMessage = getErrorMessage(error, 'Failed to extract worldbuilding');
    log.error('WorldBible extraction error', error, { rawMessage });
    const isOverloaded = /\b503\b|UNAVAILABLE|overloaded|high demand/i.test(rawMessage);
    if (isOverloaded) {
      return err(
        'upstream_unavailable',
        'Gemini is experiencing high demand right now. Please wait a minute and try again.',
        503,
      );
    }
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Extraction failed. Please try again.', status);
  }
}
