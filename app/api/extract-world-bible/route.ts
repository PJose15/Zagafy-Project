import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, FinishReason } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG, THINKING_CONFIG, GEMINI_TIMEOUT_MS } from '@/lib/ai-config';
import { safeParseGeminiResponse } from '@/lib/ai/safe-json-parse';
import { getErrorStatus } from '@/lib/api-error';
import { WORLD_BIBLE_CATEGORIES, type WorldBibleSection } from '@/lib/types/world-bible';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 3, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { chapters } = body;

    if (!Array.isArray(chapters) || chapters.length === 0) {
      return NextResponse.json({ error: 'chapters must be a non-empty array' }, { status: 400 });
    }

    let totalSize = 0;
    for (const ch of chapters) {
      if (
        typeof ch !== 'object' || ch === null ||
        typeof ch.title !== 'string' || !ch.title.trim() ||
        typeof ch.content !== 'string' || !ch.content.trim()
      ) {
        return NextResponse.json(
          { error: 'Each chapter must have a non-empty title and content' },
          { status: 400 },
        );
      }
      totalSize += ch.title.length + ch.content.length;
    }

    if (totalSize > 500_000) {
      return NextResponse.json(
        { error: 'Total chapter text exceeds 500KB limit' },
        { status: 413 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const chapterText = chapters
      .map((ch: { title: string; content: string }, i: number) =>
        `--- Chapter ${i + 1}: ${ch.title} ---\n${ch.content}`)
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

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        safetySettings: SAFETY_SETTINGS,
        thinkingConfig: THINKING_CONFIG,
        temperature: AI_CONFIG.worldBible.temperature,
        maxOutputTokens: AI_CONFIG.worldBible.maxOutputTokens,
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
      return NextResponse.json({ sections: [] });
    }

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json({ sections: [] });
    }

    // Repair fenced/partial JSON and fall back to an empty result rather than a
    // hard 502 on a single truncated or fence-wrapped response.
    const result = safeParseGeminiResponse<{ sections?: Record<string, unknown>[] }>(rawText, { sections: [] });

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

    return NextResponse.json({ sections });
  } catch (error: unknown) {
    console.error('WorldBible extraction error:', error);
    const status = getErrorStatus(error);
    return NextResponse.json({ error: 'Failed to extract worldbuilding' }, { status });
  }
}
