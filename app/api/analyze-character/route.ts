import { NextRequest } from 'next/server';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { buildCharacterAnalysisSystemPrompt, buildCharacterAnalysisPrompt } from '@/lib/prompts/character-analysis';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/analyze-character', requestId });
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { character, language } = body;

    if (!character || typeof character !== 'object') {
      return err('validation_failed', 'Missing required field: character', 400);
    }
    if (typeof character.name !== 'string' || !character.name.trim()) {
      return err('validation_failed', 'Missing required field: character.name', 400);
    }
    if (typeof language !== 'string' || !language.trim()) {
      return err('validation_failed', 'Missing required field: language', 400);
    }

    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 500000) {
      return err('validation_failed', 'Request payload too large (max 500KB)', 413);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'API key not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = buildCharacterAnalysisSystemPrompt(language);
    const prompt = buildCharacterAnalysisPrompt({
      language,
      name: character.name,
      role: character.role || '',
      coreIdentity: character.coreIdentity || '',
      currentState: character.currentState,
      stateHistory: character.stateHistory || [],
      relationships: character.relationships || [],
    });

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: AI_MODEL,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          safetySettings: SAFETY_SETTINGS,
        },
      }),
    );

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.PROHIBITED_CONTENT || finishReason === FinishReason.BLOCKLIST) {
      return ok({ analysis: 'The AI could not analyze this character. Try simplifying the character details or rephrasing.' });
    }

    let analysis = response.text || '';
    if (finishReason === FinishReason.MAX_TOKENS && analysis) {
      analysis += '\n\n---\n*Analysis was truncated due to length.*';
    }

    return ok({ analysis });

  } catch (error: unknown) {
    log.error('Character analysis API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to analyze character', status);
  }
}
