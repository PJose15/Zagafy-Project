import { NextRequest } from 'next/server';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { buildStoryCoachPrompt, buildStoryCoachContent } from '@/lib/prompts/story-coach';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { enforceAiQuota } from '@/lib/ai-quota';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';
import type { CoachingInsight, CoachingLens, CoachingPriority } from '@/lib/story-coach/types';

export const maxDuration = 30;

const VALID_LENSES: CoachingLens[] = ['tension', 'sensory', 'motivation', 'pacing', 'foreshadowing', 'dialogue'];
const VALID_PRIORITIES: CoachingPriority[] = ['low', 'medium', 'high'];

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/story-coach', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  const quotaResponse = await enforceAiQuota(authResult, { requestId });
  if (quotaResponse) return quotaResponse;

  try {
    const body = await req.json();
    const { chapterContent, chapterTitle, storyContext, focusLens, heteronymVoice, language } = body;
    const coachLanguage = typeof language === 'string' && language.trim() ? language.trim() : 'English';
    // MP-11/MP-12: optional writer-memory fragment (capped to keep context lean).
    const writerInsightsPrompt =
      typeof body.writerInsightsPrompt === 'string'
        ? body.writerInsightsPrompt.slice(0, 800)
        : '';

    if (typeof chapterContent !== 'string' || chapterContent.trim().length < 50) {
      return err('validation_failed', 'chapterContent must be at least 50 characters', 400);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'API key not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const baseSystemPrompt = buildStoryCoachPrompt(coachLanguage, heteronymVoice);
    const systemPrompt = writerInsightsPrompt
      ? `${baseSystemPrompt}\n\n${writerInsightsPrompt}`
      : baseSystemPrompt;

    const content = buildStoryCoachContent({
      chapterContent: chapterContent.slice(0, 15000), // Cap at ~15K chars
      chapterTitle,
      storyContext: typeof storyContext === 'string' ? storyContext.slice(0, 5000) : undefined,
      focusLens: typeof focusLens === 'string' ? focusLens : undefined,
    });

    const config = AI_CONFIG.storyCoach ?? { temperature: 0.3, maxOutputTokens: 4096 };

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: AI_MODEL,
        contents: content,
        config: {
          systemInstruction: systemPrompt,
          safetySettings: SAFETY_SETTINGS,
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
    );

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (
      finishReason === FinishReason.SAFETY ||
      finishReason === FinishReason.PROHIBITED_CONTENT ||
      finishReason === FinishReason.BLOCKLIST
    ) {
      log.warn('degraded', { degradationReason: 'safety_blocked' });
      return ok({
        insights: [],
        blocked: true,
        degraded: true,
        degradationReason: 'safety_blocked',
      });
    }

    const rawText = (response.text || '').trim();

    // Parse and validate insights
    let insights: CoachingInsight[] = [];
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        insights = parsed
          .filter(isValidInsight)
          // Cap observation/suggestion at 500 chars to guard against LLM over-generation, not a UX limit
          .map((item, i) => ({
            id: `coach_${Date.now()}_${i}`,
            lens: item.lens as CoachingLens,
            observation: String(item.observation).slice(0, 500),
            suggestion: String(item.suggestion).slice(0, 500),
            priority: item.priority as CoachingPriority,
          }));
      }
    } catch {
      log.warn('degraded', { degradationReason: 'parse_error' });
      return ok({
        insights: [],
        parseError: true,
        degraded: true,
        degradationReason: 'parse_error',
      });
    }

    return ok({ insights });

  } catch (error: unknown) {
    log.error('Story coach API error', error);
    const status = getErrorStatus(error);
    if (status === 429) {
      return ok({
        insights: [],
        rateLimited: true,
        degraded: true,
        degradationReason: 'rate_limited',
      });
    }
    return err(statusToCode(status), 'Failed to generate coaching insights', status);
  }
}

function isValidInsight(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lens === 'string' && VALID_LENSES.includes(o.lens as CoachingLens) &&
    typeof o.observation === 'string' && o.observation.length > 0 &&
    typeof o.suggestion === 'string' && o.suggestion.length > 0 &&
    typeof o.priority === 'string' && VALID_PRIORITIES.includes(o.priority as CoachingPriority)
  );
}
