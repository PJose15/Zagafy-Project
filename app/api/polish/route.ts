import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry, isRetryableUpstream } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';
import { anthropicConfig } from '@/lib/ai-config';

export const maxDuration = 30;

const POLISH_SYSTEM_PROMPT = `You are a skilled prose editor. The user will provide a raw voice transcript — spoken words captured via dictation. Your job:

1. Clean up filler words (um, uh, like, you know), false starts, and repetitions.
2. Fix grammar, punctuation, and sentence structure.
3. Preserve the author's voice, tone, and intent — do NOT rewrite creatively.
4. Keep the same meaning and roughly the same length.
5. Output ONLY the polished text. No commentary, no explanations.`;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/polish', requestId });
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { transcript } = body;

    if (typeof transcript !== 'string' || transcript.trim().length === 0) {
      return err('validation_failed', 'transcript is required and must be non-empty', 400);
    }

    if (transcript.length > 100000) {
      return err('validation_failed', 'Transcript too large (max 100KB)', 413);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'Anthropic API key not configured', 500);
    }

    let response: Response;
    try {
      response = await withRetry(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), anthropicConfig.timeouts.polish);
          try {
            const r = await fetch('https://api.anthropic.com/v1/messages', {
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
            // Throw on retryable upstream statuses so withRetry kicks in.
            if ([429, 502, 503, 504, 529].includes(r.status)) {
              const e: Error & { status?: number } = new Error(`Anthropic ${r.status}`);
              e.status = r.status;
              throw e;
            }
            return r;
          } finally {
            clearTimeout(timer);
          }
        },
        {
          // Our deliberate timeout is not transient; do not retry on AbortError.
          retryableErrors: (e) =>
            !(e instanceof Error && e.name === 'AbortError') && isRetryableUpstream(e),
        },
      );
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return err('upstream_timeout', 'Polish request timed out', 504);
      }
      if (fetchError && typeof fetchError === 'object' && 'status' in fetchError) {
        const status = Number((fetchError as { status: number }).status);
        if (status === 429) return err('rate_limited', 'Rate limited by AI provider', 429);
        return err(statusToCode(status), 'AI provider error', status);
      }
      throw fetchError;
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return err('rate_limited', 'Rate limited by AI provider', 429);
      }
      return err(statusToCode(status), 'AI provider error', status);
    }

    const data = await response.json();
    const polishedText = data.content?.[0]?.text?.trim() || '';

    return ok({ polishedText });
  } catch (error: unknown) {
    log.error('Polish API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to polish transcript', status);
  }
}
