import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getErrorStatus } from '@/lib/api-error';
import { anthropicConfig } from '@/lib/ai-config';

export const maxDuration = 30;

const POLISH_SYSTEM_PROMPT = `You are a skilled prose editor. The user will provide a raw voice transcript — spoken words captured via dictation. Your job:

1. Clean up filler words (um, uh, like, you know), false starts, and repetitions.
2. Fix grammar, punctuation, and sentence structure.
3. Preserve the author's voice, tone, and intent — do NOT rewrite creatively.
4. Keep the same meaning and roughly the same length.
5. Output ONLY the polished text. No commentary, no explanations.`;

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { transcript } = body;

    if (typeof transcript !== 'string' || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'transcript is required and must be non-empty' },
        { status: 400 }
      );
    }

    if (transcript.length > 100000) {
      return NextResponse.json({ error: 'Transcript too large (max 100KB)' }, { status: 413 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), anthropicConfig.timeouts.polish);

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: anthropicConfig.model,
          max_tokens: 4096,
          system: POLISH_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: transcript.trim() }],
        }),
        signal: controller.signal,
      });
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json({ error: 'Polish request timed out' }, { status: 504 });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return NextResponse.json({ error: 'Rate limited by AI provider' }, { status: 429 });
      }
      return NextResponse.json({ error: 'AI provider error' }, { status });
    }

    const data = await response.json();
    const polishedText = data.content?.[0]?.text?.trim() || '';

    return NextResponse.json({ polishedText });
  } catch (error: unknown) {
    console.error('Polish API error:', error);
    const status = getErrorStatus(error);
    return NextResponse.json({ error: 'Failed to polish transcript' }, { status });
  }
}
