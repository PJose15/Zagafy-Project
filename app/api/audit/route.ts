import { NextRequest } from 'next/server';
import { GoogleGenAI, Type, FinishReason } from '@google/genai';
import { buildWritingAssistantPrompt } from '@/lib/prompts/writing-assistant';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { enforceAiQuota } from '@/lib/ai-quota';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/audit', requestId });
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  const quotaResponse = await enforceAiQuota(authResult, { requestId });
  if (quotaResponse) return quotaResponse;

  try {
    const body = await req.json();
    const { userInput, language } = body;
    const storyContext = typeof body.storyContext === 'string' ? body.storyContext : '';

    if (typeof userInput !== 'string' || !userInput.trim()) {
      return err('validation_failed', 'Missing required field: userInput', 400);
    }
    if (typeof language !== 'string' || !language.trim()) {
      return err('validation_failed', 'Missing required field: language', 400);
    }

    const totalLength = (storyContext?.length || 0) + (userInput?.length || 0);
    if (totalLength > 500000) {
      return err('validation_failed', 'Request payload too large (max 500KB of text)', 413);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'API key not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = buildWritingAssistantPrompt(language);

    const prompt = `<story_context>
${storyContext}
</story_context>

Perform a Continuity Audit on the following requested idea/scene:
<user_request>
${userInput}
</user_request>

Analyze it against the established canon. Check for these specific dimensions:
1. CHARACTER LOGIC: Does this action match the character's current emotional state, pressure level, knowledge, and hidden needs? Would they actually do/say this given their trust and tension levels with other characters?
2. TIMELINE CONSISTENCY: Does this fit the chronological sequence? Are there impossible time jumps or events happening out of order?
3. RELATIONSHIP INTEGRITY: Does character interaction match their established trust% and tension% levels? Would characters who distrust each other suddenly cooperate?
4. CANON CONTRADICTIONS: Does this break any confirmed-canon facts, world rules, or established lore?
5. FORESHADOWING COHERENCE: Does this ignore planted setups or contradict hinted payoffs? Are there setups that could be paid off here?
6. TONE AND PACING: Does this fit the established style profile and current arc pacing? Is it too fast or too slow for this point in the story?
7. WORLD RULES: Does this violate any established world rules, magic systems, or internal logic?

For each risk found, explain which specific story element it contradicts and why.`;

    const response = await withRetry(() =>
      ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        temperature: AI_CONFIG.audit.temperature,
        maxOutputTokens: AI_CONFIG.audit.maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, description: "'Clear', 'Warnings', or 'Contradictions'" },
            risks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  level: { type: Type.STRING, description: "'Low', 'Medium', or 'High'" },
                  description: { type: Type.STRING },
                  rootCause: { type: Type.STRING, description: 'The specific canon element, character state, or story fact that this conflicts with' },
                  affectedElements: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            },
            suggestedCorrections: { type: Type.ARRAY, items: { type: Type.STRING } },
            safeVersion: { type: Type.STRING, description: 'A version that respects canon while preserving the user\'s creative intent as closely as possible' }
          }
        }
      }
      }),
    );

    // Check if the response was blocked
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.PROHIBITED_CONTENT || finishReason === FinishReason.BLOCKLIST) {
      return ok({
        status: 'Clear',
        risks: [{ level: 'Low', description: 'The AI could not audit this content. Try rephrasing your input.', affectedElements: [] }],
        suggestedCorrections: [],
        safeVersion: '',
      });
    }

    const rawText = response.text;
    if (!rawText) {
      return ok({ status: 'Clear', risks: [], suggestedCorrections: [], safeVersion: '' });
    }
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      log.error('Gemini returned invalid JSON', undefined, { rawTextSample: rawText.slice(0, 500) });
      return err('parse_error', 'AI returned an invalid response. Please try again.', 502);
    }
    // Ensure expected shape so the client doesn't crash
    return ok({
      status: typeof result.status === 'string' ? result.status : 'Clear',
      risks: Array.isArray(result.risks) ? result.risks : [],
      suggestedCorrections: Array.isArray(result.suggestedCorrections) ? result.suggestedCorrections : [],
      safeVersion: typeof result.safeVersion === 'string' ? result.safeVersion : '',
    });

  } catch (error: unknown) {
    log.error('Audit API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to perform audit', status);
  }
}
