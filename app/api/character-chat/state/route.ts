import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { callAnthropicMessages } from '@/lib/ai/anthropic';
import type { ChatMode, EvolvedState } from '@/lib/types/character-chat';

export const maxDuration = 30;

// Living-state evolution. After each exchange the client asks for the
// character's updated MOMENTARY state (emotional state + pressure + indicator)
// so the chat UI can show them visibly react and escalate. Non-blocking: a
// failure returns { state: null, error } (HTTP 200) and the chat carries on.
const STATE_DEADLINE_MS = 20_000;
const MAX_TRANSCRIPT_CHARS = 30_000;
const MAX_NAME = 200;

const VALID_MODES: ChatMode[] = ['exploration', 'scene', 'confrontation'];
const VALID_PRESSURE = ['Low', 'Medium', 'High', 'Critical'] as const;
const VALID_INDICATOR = [
  'stable',
  'shifting',
  'under pressure',
  'emotionally conflicted',
  'at risk of contradiction',
] as const;

type StateError = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';

function parseEvolvedState(text: string): EvolvedState | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const pressureLevel = VALID_PRESSURE.includes(obj.pressureLevel as typeof VALID_PRESSURE[number])
    ? (obj.pressureLevel as EvolvedState['pressureLevel'])
    : null;
  const indicator = VALID_INDICATOR.includes(obj.indicator as typeof VALID_INDICATOR[number])
    ? (obj.indicator as EvolvedState['indicator'])
    : null;
  if (!pressureLevel || !indicator) return null;
  const emotionalState =
    typeof obj.emotionalState === 'string' ? obj.emotionalState.trim().slice(0, 80) : '';
  return { emotionalState, pressureLevel, indicator };
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/character-chat/state', requestId });
  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { characterName, mode, transcript, currentState } = body;

    const name = typeof characterName === 'string' ? characterName.trim().slice(0, MAX_NAME) : '';
    const text = typeof transcript === 'string' ? transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : '';
    if (!name || !text) {
      return err('validation_failed', 'characterName and transcript are required', 400);
    }
    const safeMode: ChatMode = VALID_MODES.includes(mode) ? mode : 'exploration';

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return err(
        'internal_error',
        'Character Chat is not configured. Set ANTHROPIC_API_KEY in this environment to enable it.',
        500,
        { reason: 'ai_not_configured', provider: 'anthropic' },
      );
    }

    const priorState =
      currentState && typeof currentState === 'object' ? JSON.stringify(currentState) : '{}';

    const result = await callAnthropicMessages({
      apiKey,
      system:
        'You are a narrative psychology engine for a fiction-writing tool. Given a character and the latest exchange in a conversation, infer the character\'s updated MOMENTARY emotional state. Pressure rises under confrontation and probing, cracks show under strain, and it can ease during gentle exploration. Respond with ONLY a compact JSON object and nothing else: {"emotionalState": "<=60 character phrase", "pressureLevel": "Low"|"Medium"|"High"|"Critical", "indicator": "stable"|"shifting"|"under pressure"|"emotionally conflicted"|"at risk of contradiction"}. No prose, no markdown fences.',
      messages: [
        {
          role: 'user',
          content: `Character: ${name}\nConversation mode: ${safeMode}\nPrior state: ${priorState}\n\nConversation so far:\n${text}\n\nReturn the character's updated state as JSON.`,
        },
      ],
      maxTokens: 200,
      temperature: 0.4,
      deadlineMs: STATE_DEADLINE_MS,
    });

    if (!result.ok) {
      const stateError: StateError =
        result.kind === 'timeout'
          ? 'timeout'
          : result.kind === 'rate_limited'
            ? 'rate_limited'
            : 'upstream_error';
      log.warn('state: upstream failure', { kind: result.kind });
      return ok({ state: null, error: stateError });
    }

    const evolved = parseEvolvedState(result.text);
    if (!evolved) {
      log.warn('state: could not parse JSON state from response');
      return ok({ state: null, error: 'parse_error' as StateError });
    }

    return ok({ state: evolved, error: undefined });
  } catch (error: unknown) {
    log.error('Character chat state API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to evolve character state', status);
  }
}
