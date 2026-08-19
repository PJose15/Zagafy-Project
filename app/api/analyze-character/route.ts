import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { buildCharacterAnalysisSystemPrompt, buildCharacterAnalysisPrompt } from '@/lib/prompts/character-analysis';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG, THINKING_CONFIG, GEMINI_TIMEOUT_MS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { character, language } = body;

    if (!character || typeof character !== 'object') {
      return NextResponse.json({ error: 'Missing required field: character' }, { status: 400 });
    }
    if (typeof character.name !== 'string' || !character.name.trim()) {
      return NextResponse.json({ error: 'Missing required field: character.name' }, { status: 400 });
    }
    if (typeof language !== 'string' || !language.trim()) {
      return NextResponse.json({ error: 'Missing required field: language' }, { status: 400 });
    }

    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 500000) {
      return NextResponse.json({ error: 'Request payload too large (max 500KB)' }, { status: 413 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
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

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        thinkingConfig: THINKING_CONFIG,
        temperature: AI_CONFIG.characterAnalysis.temperature,
        maxOutputTokens: AI_CONFIG.characterAnalysis.maxOutputTokens,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.PROHIBITED_CONTENT || finishReason === FinishReason.BLOCKLIST) {
      return NextResponse.json({ analysis: 'The AI could not analyze this character. Try simplifying the character details or rephrasing.' });
    }

    let analysis = response.text || '';
    if (finishReason === FinishReason.MAX_TOKENS && analysis) {
      analysis += '\n\n---\n*Analysis was truncated due to length.*';
    }

    return NextResponse.json({ analysis });

  } catch (error: unknown) {
    console.error('Character analysis API error:', error);
    const status = getErrorStatus(error);
    return NextResponse.json({ error: 'Failed to analyze character' }, { status });
  }
}
