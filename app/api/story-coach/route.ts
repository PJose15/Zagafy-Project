import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, FinishReason, Type } from '@google/genai';
import { buildStoryCoachPrompt, buildStoryCoachContent } from '@/lib/prompts/story-coach';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG, THINKING_CONFIG, GEMINI_TIMEOUT_MS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import type { CoachingInsight, CoachingLens, CoachingPriority } from '@/lib/story-coach/types';

export const maxDuration = 30;

const VALID_LENSES: CoachingLens[] = ['tension', 'sensory', 'motivation', 'pacing', 'foreshadowing', 'dialogue'];
const VALID_PRIORITIES: CoachingPriority[] = ['low', 'medium', 'high'];

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { chapterContent, chapterTitle, storyContext, focusLens, heteronymVoice, language } = body;
    const coachLanguage = typeof language === 'string' && language.trim() ? language.trim() : 'English';

    if (typeof chapterContent !== 'string' || chapterContent.trim().length < 50) {
      return NextResponse.json(
        { error: 'chapterContent must be at least 50 characters' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = buildStoryCoachPrompt(coachLanguage, heteronymVoice);

    const content = buildStoryCoachContent({
      chapterContent: chapterContent.slice(0, 15000), // Cap at ~15K chars
      chapterTitle,
      storyContext: typeof storyContext === 'string' ? storyContext.slice(0, 5000) : undefined,
      focusLens: typeof focusLens === 'string' ? focusLens : undefined,
    });

    const config = AI_CONFIG.storyCoach ?? { temperature: 0.3, maxOutputTokens: 4096 };

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: content,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        thinkingConfig: THINKING_CONFIG,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        responseMimeType: 'application/json',
        // Constrain the model to the insight array shape (matches isValidInsight)
        // so structured output is reliable rather than prompt-only.
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              lens: { type: Type.STRING, enum: [...VALID_LENSES] },
              observation: { type: Type.STRING },
              suggestion: { type: Type.STRING },
              priority: { type: Type.STRING, enum: [...VALID_PRIORITIES] },
            },
            required: ['lens', 'observation', 'suggestion', 'priority'],
          },
        },
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (
      finishReason === FinishReason.SAFETY ||
      finishReason === FinishReason.PROHIBITED_CONTENT ||
      finishReason === FinishReason.BLOCKLIST
    ) {
      return NextResponse.json({ insights: [], blocked: true });
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
      // JSON parse failed — return empty
      return NextResponse.json({ insights: [], parseError: true });
    }

    return NextResponse.json({ insights });

  } catch (error: unknown) {
    console.error('Story coach API error:', error);
    const status = getErrorStatus(error);
    if (status === 429) {
      return NextResponse.json({ insights: [], rateLimited: true });
    }
    return NextResponse.json({ error: 'Failed to generate coaching insights' }, { status });
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
