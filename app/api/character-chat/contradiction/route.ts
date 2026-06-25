import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { callAnthropicMessages } from '@/lib/ai/anthropic';
import type { ContradictionFlag } from '@/lib/types/character-chat';

export const maxDuration = 30;

// Canon consistency check. After a reply, the client asks whether it directly
// contradicts any established canon fact. Non-blocking: a failure returns
// { contradictions: [], error } (HTTP 200) and the chat carries on.
const CHECK_DEADLINE_MS = 20_000;
const MAX_REPLY = 8_000;
const MAX_NAME = 200;
const MAX_CANON_ITEMS = 40;
const MAX_CANON_ITEM = 400;
const MAX_FLAGS = 10;

type CheckError = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';

function parseFlags(text: string): ContradictionFlag[] | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(obj.contradictions)) return null;
  return obj.contradictions
    .filter(
      (c): c is { fact: unknown; explanation: unknown } =>
        !!c && typeof c === 'object',
    )
    .map(c => ({
      fact: typeof c.fact === 'string' ? c.fact.trim().slice(0, MAX_CANON_ITEM) : '',
      explanation: typeof c.explanation === 'string' ? c.explanation.trim().slice(0, 400) : '',
    }))
    .filter(c => c.fact && c.explanation)
    .slice(0, MAX_FLAGS);
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/character-chat/contradiction', requestId });
  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { characterName, reply, canon } = body;

    const name = typeof characterName === 'string' ? characterName.trim().slice(0, MAX_NAME) : '';
    const replyText = typeof reply === 'string' ? reply.trim().slice(0, MAX_REPLY) : '';
    const canonList = Array.isArray(canon)
      ? canon
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .slice(0, MAX_CANON_ITEMS)
          .map(x => x.trim().slice(0, MAX_CANON_ITEM))
      : [];

    if (!name || !replyText) {
      return err('validation_failed', 'characterName and reply are required', 400);
    }
    // Nothing to check against — not an error, just no canon.
    if (canonList.length === 0) {
      return ok({ contradictions: [] as ContradictionFlag[] });
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
      system:
        'You are a continuity checker for fiction. You are given a set of established canon facts and a single reply a character just produced. Identify ONLY direct factual contradictions between the reply and the canon (e.g. canon says blue eyes but the reply says brown; canon says the war ended in 1847 but the reply says 1850). Do NOT flag omissions, plausible new details that do not conflict, speculation, or tone. Respond with ONLY a JSON object and nothing else: {"contradictions":[{"fact":"<the canon fact contradicted>","explanation":"<one sentence: how the reply conflicts>"}]}. Use an empty array when there are no clear contradictions.',
      messages: [
        {
          role: 'user',
          content: `Canon facts:\n- ${canonList.join('\n- ')}\n\nCharacter (${name}) just said:\n"${replyText}"\n\nReturn the contradictions as JSON.`,
        },
      ],
      maxTokens: 500,
      temperature: 0,
      deadlineMs: CHECK_DEADLINE_MS,
    });

    if (!result.ok) {
      const checkError: CheckError =
        result.kind === 'timeout'
          ? 'timeout'
          : result.kind === 'rate_limited'
            ? 'rate_limited'
            : 'upstream_error';
      log.warn('contradiction: upstream failure', { kind: result.kind });
      return ok({ contradictions: [] as ContradictionFlag[], error: checkError });
    }

    const flags = parseFlags(result.text);
    if (flags === null) {
      log.warn('contradiction: could not parse JSON from response');
      return ok({ contradictions: [] as ContradictionFlag[], error: 'parse_error' as CheckError });
    }

    return ok({ contradictions: flags, error: undefined });
  } catch (error: unknown) {
    log.error('Character chat contradiction API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to check for contradictions', status);
  }
}
