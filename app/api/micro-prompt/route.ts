import { NextRequest } from 'next/server';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { buildMicroPromptSystemPrompt, buildMicroPromptContent, validateMicroPromptResponse } from '@/lib/prompts/micro-prompt';
import { buildVoiceDirective } from '@/lib/heteronym-voice';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/micro-prompt', requestId });
  const limited = await rateLimit(req, { maxRequests: 60, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { recentText, genre, protagonistName, blockType, storyContext } = body;
    const heteronym = body.heteronym && typeof body.heteronym === 'object' && typeof body.heteronym.name === 'string'
      ? body.heteronym : null;
    // MP-11/MP-12: optional writer-memory fragment (capped to keep context lean).
    const writerInsightsPrompt =
      typeof body.writerInsightsPrompt === 'string'
        ? body.writerInsightsPrompt.slice(0, 800)
        : '';

    if (typeof recentText !== 'string' || recentText.trim().length < 20) {
      return err('validation_failed', 'recentText must be at least 20 characters', 400);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'API key not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const baseSystemPrompt = buildMicroPromptSystemPrompt();
    const systemPrompt = writerInsightsPrompt
      ? `${baseSystemPrompt}\n\n${writerInsightsPrompt}`
      : baseSystemPrompt;

    // Send last 600 words for better scene context
    const words = recentText.trim().split(/\s+/);
    const truncatedText = words.slice(-600).join(' ');

    const voiceDirective = heteronym ? buildVoiceDirective(heteronym) : undefined;

    const prompt = buildMicroPromptContent({
      recentText: truncatedText,
      storyContext,
      genre,
      protagonistName,
      blockType,
      voiceDirective,
    });

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: AI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          safetySettings: SAFETY_SETTINGS,
          maxOutputTokens: 150,
          temperature: 0.7,
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
      return ok({ prompt: '', degraded: true, degradationReason: 'safety_blocked' });
    }

    const rawText = (response.text || '').trim();
    const validated = validateMicroPromptResponse(rawText);

    if (!validated) {
      log.warn('degraded', { degradationReason: 'empty_or_invalid' });
      return ok({ prompt: '', degraded: true, degradationReason: 'empty_or_invalid' });
    }

    return ok({ prompt: validated });
  } catch (error: unknown) {
    log.error('Micro-prompt API error', error);
    const status = getErrorStatus(error);
    // Don't break flow on rate-limit — surface as degraded so the UI can
    // hint that a prompt is unavailable without showing a hard error.
    if (status === 429) {
      return ok({ prompt: '', degraded: true, degradationReason: 'rate_limited' });
    }
    return err(statusToCode(status), 'Failed to generate prompt', status);
  }
}
