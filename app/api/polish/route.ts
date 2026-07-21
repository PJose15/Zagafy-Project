import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { enforceAiQuota } from '@/lib/ai-quota';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { callAnthropicMessages } from '@/lib/ai/anthropic';
import { createRouteLogger } from '@/lib/logger';

export const maxDuration = 30;

// Wall-clock budget for the Anthropic call, kept a few seconds under maxDuration
// so the function returns before the platform kills it.
const POLISH_DEADLINE_MS = 27_000;

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

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  const quotaResponse = await enforceAiQuota(authResult, { requestId });
  if (quotaResponse) return quotaResponse;

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

    // Route through the shared Anthropic caller: it enforces one wall-clock
    // deadline across retries and extracts the first *text* block (skipping
    // leading thinking blocks), so an ANTHROPIC_MODEL upgrade to a thinking-first
    // model like Opus 4.7+/Fable doesn't silently return empty polishedText.
    const result = await callAnthropicMessages({
      apiKey,
      system: POLISH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript.trim() }],
      maxTokens: 4096,
      deadlineMs: POLISH_DEADLINE_MS,
    });

    if (!result.ok) {
      if (result.kind === 'timeout') {
        return err('upstream_timeout', 'Polish request timed out', 504);
      }
      if (result.kind === 'rate_limited') {
        return err('rate_limited', 'Rate limited by AI provider', 429);
      }
      return err(statusToCode(result.status), 'AI provider error', result.status);
    }

    return ok({ polishedText: result.text });
  } catch (error: unknown) {
    log.error('Polish API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to polish transcript', status);
  }
}
