import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS, THINKING_CONFIG, AI_CONFIG, GEMINI_TIMEOUT_MS } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';

const FALLBACK_QUESTIONS = [
  'What surprised you about what you wrote today?',
  'Which character felt most alive in this session?',
  'What would your protagonist say about today\'s work?',
  'Did you discover something unexpected about your story?',
  'What scene are you most curious to write next?',
];

function getRandomFallback(): string {
  return FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { storyContext, wordsWritten } = body;

    if (typeof wordsWritten !== 'number') {
      return NextResponse.json(
        { error: 'wordsWritten is required and must be a number' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ question: getRandomFallback() });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = 'You are a writing mentor. Generate ONE reflective question (max 20 words) about the writer\'s session. Be warm, specific, and thought-provoking. Output ONLY the question.';

    const userMessage = `The writer wrote ${wordsWritten} words this session.${
      storyContext && typeof storyContext === 'string'
        ? ` Recent context: ${storyContext.slice(0, 500)}`
        : ''
    }`;

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      config: {
        temperature: AI_CONFIG.closingQuestion.temperature,
        // Thinking disabled + a real output budget so the model actually returns
        // the question instead of spending 80 tokens thinking and returning empty.
        thinkingConfig: THINKING_CONFIG,
        maxOutputTokens: AI_CONFIG.closingQuestion.maxOutputTokens,
        safetySettings: SAFETY_SETTINGS,
        systemInstruction: systemPrompt,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
      contents: userMessage,
    });

    const question = response.text?.trim();

    if (!question) {
      return NextResponse.json({ question: getRandomFallback() });
    }

    return NextResponse.json({ question });
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 429) {
      return NextResponse.json({ error: 'Rate limited by AI provider' }, { status: 429 });
    }
    // On any error, return a fallback question instead of failing
    return NextResponse.json({ question: getRandomFallback() });
  }
}
