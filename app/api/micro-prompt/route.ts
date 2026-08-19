import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { buildMicroPromptSystemPrompt, buildMicroPromptContent, validateMicroPromptResponse } from '@/lib/prompts/micro-prompt';
import { buildVoiceDirective } from '@/lib/heteronym-voice';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS, THINKING_CONFIG, GEMINI_TIMEOUT_MS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 60, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { recentText, genre, protagonistName, blockType, storyContext } = body;
    const heteronym = body.heteronym && typeof body.heteronym === 'object' && typeof body.heteronym.name === 'string'
      ? body.heteronym : null;

    if (typeof recentText !== 'string' || recentText.trim().length < 20) {
      return NextResponse.json(
        { error: 'recentText must be at least 20 characters' },
        { status: 400 }
      );
    }

    // Cap total payload size: this route has the most permissive rate limit
    // (60/min), and storyContext is otherwise interpolated into the prompt
    // unbounded — guard against cost-amplification via a huge context.
    if (JSON.stringify(body).length > 500_000) {
      return NextResponse.json(
        { error: 'Request payload too large (max 500KB of text)' },
        { status: 413 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = buildMicroPromptSystemPrompt();

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

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        // Thinking disabled so the whole (small) budget goes to the prompt text —
        // otherwise gemini-2.5-flash spends it all "thinking" and returns nothing.
        thinkingConfig: THINKING_CONFIG,
        maxOutputTokens: 256,
        temperature: 0.7,
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
      return NextResponse.json({ prompt: '' });
    }

    const rawText = (response.text || '').trim();
    const validated = validateMicroPromptResponse(rawText);

    // Return validated prompt, or empty if garbage (never show garbage to user)
    return NextResponse.json({ prompt: validated || '' });
  } catch (error: unknown) {
    console.error('Micro-prompt API error:', error);
    const status = getErrorStatus(error);
    // On rate limit (429) or other errors, return empty prompt silently
    // so the UI doesn't show an error — the writer should not be interrupted
    if (status === 429) {
      return NextResponse.json({ prompt: '' });
    }
    return NextResponse.json({ error: 'Failed to generate prompt' }, { status });
  }
}
