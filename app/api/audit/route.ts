import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, FinishReason } from '@google/genai';
import { buildWritingAssistantPrompt } from '@/lib/prompts/writing-assistant';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG, THINKING_CONFIG, GEMINI_TIMEOUT_MS } from '@/lib/ai-config';
import { safeParseGeminiResponse } from '@/lib/ai/safe-json-parse';
import { getErrorStatus } from '@/lib/api-error';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { userInput, language } = body;
    const storyContext = typeof body.storyContext === 'string' ? body.storyContext : '';

    if (typeof userInput !== 'string' || !userInput.trim()) {
      return NextResponse.json({ error: 'Missing required field: userInput' }, { status: 400 });
    }
    if (typeof language !== 'string' || !language.trim()) {
      return NextResponse.json({ error: 'Missing required field: language' }, { status: 400 });
    }

    const totalLength = (storyContext?.length || 0) + (userInput?.length || 0);
    if (totalLength > 500000) {
      return NextResponse.json({ error: 'Request payload too large (max 500KB of text)' }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
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

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        thinkingConfig: THINKING_CONFIG,
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
        },
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      }
    });

    // Check if the response was blocked
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.PROHIBITED_CONTENT || finishReason === FinishReason.BLOCKLIST) {
      return NextResponse.json({
        status: 'Clear',
        risks: [{ level: 'Low', description: 'The AI could not audit this content. Try rephrasing your input.', affectedElements: [] }],
        suggestedCorrections: [],
        safeVersion: '',
      });
    }

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ status: 'Clear', risks: [], suggestedCorrections: [], safeVersion: '' });
    }
    // Repair fenced/partial JSON; fall back to a clear result rather than a hard
    // 502 on a single truncated or fence-wrapped response.
    const result = safeParseGeminiResponse<Record<string, unknown>>(rawText, {
      status: 'Clear', risks: [], suggestedCorrections: [], safeVersion: '',
    });
    // Ensure expected shape so the client doesn't crash
    return NextResponse.json({
      status: typeof result.status === 'string' ? result.status : 'Clear',
      risks: Array.isArray(result.risks) ? result.risks : [],
      suggestedCorrections: Array.isArray(result.suggestedCorrections) ? result.suggestedCorrections : [],
      safeVersion: typeof result.safeVersion === 'string' ? result.safeVersion : '',
    });

  } catch (error: unknown) {
    console.error('Audit API error:', error);
    const status = getErrorStatus(error);
    return NextResponse.json({ error: 'Failed to perform audit' }, { status });
  }
}
