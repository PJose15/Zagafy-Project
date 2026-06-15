import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/publishing/synopsis', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;
  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const { length, title, genre, synopsis, chapters, characters, language } = await req.json();
    if (!length || !title) {
      return err('validation_failed', 'Missing required fields: length, title', 400);
    }
    if (length !== '1-page' && length !== '5-page') {
      return err('validation_failed', 'Length must be "1-page" or "5-page"', 400);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return err('internal_error', 'API key not configured', 500);

    const ai = new GoogleGenAI({ apiKey });
    const wordTarget = length === '1-page' ? '500-600' : '2500-3000';
    const prompt = `Generate a professional ${length} synopsis for a novel.
Title: ${title}
Genre: ${genre || 'Not specified'}
Brief Synopsis: ${synopsis || 'Not provided'}
Characters: ${characters || 'Not provided'}
Chapter Summaries: ${chapters || 'Not provided'}
Language: ${language || 'English'}

Write a compelling, industry-standard ${length} synopsis (approximately ${wordTarget} words).
Include: main character introduction, inciting incident, major plot points, climax, and resolution.
Reveal the ending — this is a synopsis, not a blurb.
Respond entirely in ${language || 'English'}.`;

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: { safetySettings: SAFETY_SETTINGS, temperature: 0.7, maxOutputTokens: length === '5-page' ? 4096 : 2048 },
    });

    return ok({ synopsis: response.text || '' });
  } catch (error: unknown) {
    log.error('Synopsis generation error', error);
    return err('internal_error', 'Failed to generate synopsis', 500);
  }
}
