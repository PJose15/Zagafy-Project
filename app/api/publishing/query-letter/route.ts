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
  const log = createRouteLogger({ endpoint: '/api/publishing/query-letter', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;
  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const { title, genre, synopsis, protagonistName, agentName, agencyName, language } = await req.json();
    if (!title || !genre || !synopsis) {
      return err('validation_failed', 'Missing required fields: title, genre, synopsis', 400);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return err('internal_error', 'API key not configured', 500);

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Generate a professional query letter for a literary agent.
Title: ${title}
Genre: ${genre}
Synopsis: ${synopsis}
Protagonist: ${protagonistName || 'Not specified'}
Target Agent: ${agentName || 'Dear Agent'}
Agency: ${agencyName || ''}
Language: ${language || 'English'}

Write a compelling, industry-standard query letter. Include: hook, brief synopsis (250 words max), bio placeholder, word count placeholder. Respond in ${language || 'English'}.`;

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: { safetySettings: SAFETY_SETTINGS, temperature: 0.7, maxOutputTokens: 2048 },
    });

    return ok({ letter: response.text || '' });
  } catch (error: unknown) {
    log.error('Query letter error', error);
    return err('internal_error', 'Failed to generate query letter', 500);
  }
}
