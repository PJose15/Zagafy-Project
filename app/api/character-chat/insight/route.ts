import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { anthropicConfig } from '@/lib/ai-config';
import { callAnthropicMessages } from '@/lib/ai/anthropic';

export const maxDuration = 30;

// Secondary call — generates ONE character insight from a transcript. Split out
// of /api/character-chat so the reply is returned immediately and is never lost
// when this slower call times out. Failures are reported as a structured
// insightError (HTTP 200) so the client can show "insight unavailable" without
// treating it as a chat failure.
const INSIGHT_DEADLINE_MS = 25_000;
const MAX_TRANSCRIPT_CHARS = 30_000;
const MAX_NAME = 200;

type InsightError = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/character-chat/insight', requestId });
  const limited = await rateLimit(req, { maxRequests: 15, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { characterName, transcript } = body;

    const name =
      typeof characterName === 'string' ? characterName.trim().slice(0, MAX_NAME) : '';
    const text =
      typeof transcript === 'string' ? transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : '';
    if (!name || !text) {
      return err('validation_failed', 'characterName and transcript are required', 400);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return err(
        'internal_error',
        'Character Chat is not configured. Set ANTHROPIC_API_KEY in this environment to enable it.',
        500,
        { reason: 'ai_not_configured', provider: 'anthropic' },
      );
    }

    const result = await callAnthropicMessages({
      apiKey,
      system: 'You are a literary analyst. Extract character insights from conversations.',
      messages: [
        {
          role: 'user',
          content: `Analyze this conversation and extract ONE key insight about the character "${name}":\n\n${text}`,
        },
      ],
      maxTokens: 256,
      temperature: anthropicConfig.temperatures.characterInsight,
      deadlineMs: INSIGHT_DEADLINE_MS,
    });

    if (!result.ok) {
      const insightError: InsightError =
        result.kind === 'timeout'
          ? 'timeout'
          : result.kind === 'rate_limited'
            ? 'rate_limited'
            : 'upstream_error';
      log.warn('insight: upstream failure', { kind: result.kind });
      return ok({ insight: null, insightError });
    }

    if (!result.text) {
      log.warn('insight: empty/unrecognized response shape');
      return ok({ insight: null, insightError: 'parse_error' as InsightError });
    }

    return ok({ insight: result.text, insightError: undefined });
  } catch (error: unknown) {
    log.error('Character chat insight API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to generate insight', status);
  }
}
