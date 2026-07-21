import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { enforceAiQuota } from '@/lib/ai-quota';
import { getErrorStatus } from '@/lib/api-error';
import { err, statusToCode, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { anthropicConfig } from '@/lib/ai-config';
import { streamAnthropicText } from '@/lib/ai/anthropic';
import { buildSystemPrompt } from '@/lib/prompts/character-chat';
import type { Character, CharacterState } from '@/lib/store';
import type { ChatMode, StoryContext } from '@/lib/types/character-chat';

export const maxDuration = 30;

// Wall-clock budget for the single upstream call. Kept comfortably under
// maxDuration so a slow generation + one retry still returns gracefully
// (with a 504) instead of letting the platform hard-kill the function.
const CHAT_DEADLINE_MS = 27_000;

const VALID_MODES: ChatMode[] = ['exploration', 'scene', 'confrontation'];
const VALID_PRESSURE = ['Low', 'Medium', 'High', 'Critical'] as const;
const VALID_INDICATOR = ['stable', 'shifting', 'under pressure', 'emotionally conflicted', 'at risk of contradiction'] as const;

// History caps — prevents abuse / context-window blowup / runaway billing
const MAX_HISTORY_TURNS = 30;
const MAX_HISTORY_CHARS = 30_000;
const MAX_HISTORY_MSG_CHARS = 5_000;

// Field caps for the sanitized character payload
const MAX_NAME = 200;
const MAX_ROLE = 200;
const MAX_LONG = 2_000;
const MAX_STATE = 500;

// Caps for the story-grounding payload (keeps prompt size + proxy abuse bounded)
const MAX_PREMISE = 1_500;
const MAX_CANON_ITEMS = 40;
const MAX_CANON_ITEM = 400;
const MAX_STORY_SO_FAR = 12_000;

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function optStr(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, max);
}

function sanitizeCharacter(input: unknown): Character | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;

  const name = str(o.name, MAX_NAME);
  const role = str(o.role, MAX_ROLE);
  const description = str(o.description, MAX_LONG);
  if (!name || !role || !description) return null;

  let currentState: CharacterState | undefined;
  if (o.currentState && typeof o.currentState === 'object') {
    const s = o.currentState as Record<string, unknown>;
    const pressureLevel = VALID_PRESSURE.includes(s.pressureLevel as typeof VALID_PRESSURE[number])
      ? (s.pressureLevel as CharacterState['pressureLevel'])
      : 'Medium';
    const indicator = VALID_INDICATOR.includes(s.indicator as typeof VALID_INDICATOR[number])
      ? (s.indicator as CharacterState['indicator'])
      : 'stable';
    currentState = {
      emotionalState: optStr(s.emotionalState, MAX_STATE) ?? '',
      visibleGoal: optStr(s.visibleGoal, MAX_STATE) ?? '',
      hiddenNeed: optStr(s.hiddenNeed, MAX_STATE) ?? '',
      currentFear: optStr(s.currentFear, MAX_STATE) ?? '',
      dominantBelief: optStr(s.dominantBelief, MAX_STATE) ?? '',
      emotionalWound: optStr(s.emotionalWound, MAX_STATE) ?? '',
      pressureLevel,
      currentKnowledge: optStr(s.currentKnowledge, MAX_STATE) ?? '',
      indicator,
    };
  }

  return {
    id: typeof o.id === 'string' ? o.id : '',
    name,
    role,
    description,
    coreIdentity: optStr(o.coreIdentity, MAX_LONG),
    relationships: optStr(o.relationships, MAX_LONG) ?? '',
    currentState,
  };
}

function sanitizeStoryContext(input: unknown): StoryContext | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const o = input as Record<string, unknown>;
  const premise = optStr(o.premise, MAX_PREMISE);
  const canonRaw = Array.isArray(o.canon)
    ? o.canon
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .slice(0, MAX_CANON_ITEMS)
        .map(x => x.trim().slice(0, MAX_CANON_ITEM))
    : [];
  const storySoFar = optStr(o.storySoFar, MAX_STORY_SO_FAR);
  if (!premise && canonRaw.length === 0 && !storySoFar) return undefined;
  return { premise, canon: canonRaw.length ? canonRaw : undefined, storySoFar };
}

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/character-chat', requestId });
  const limited = await rateLimit(req, { maxRequests: 15, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  // Only the main chat turn is metered — the auxiliary state/insight/
  // contradiction/memory routes are fire-and-forget sidecars of this turn
  // and deliberately do NOT count against the monthly AI quota.
  const quotaResponse = await enforceAiQuota(authResult, { requestId });
  if (quotaResponse) return quotaResponse;

  try {
    const body = await req.json();
    const { message, mode, character, messages, storyContext: storyContextRaw, memory: memoryRaw } = body;

    // Validate message (the new turn from the user)
    if (typeof message !== 'string' || message.trim().length === 0) {
      return err('validation_failed', 'message is required and must be non-empty', 400);
    }

    if (message.length > 10000) {
      return err('validation_failed', 'Message too large (max 10000 characters)', 413);
    }

    if (!VALID_MODES.includes(mode)) {
      return err('validation_failed', 'mode must be one of: exploration, scene, confrontation', 400);
    }

    // Validate the character payload — server builds the prompt from this,
    // never accepts a raw systemPrompt from the client (prevents open-proxy abuse).
    const sanitized = sanitizeCharacter(character);
    if (!sanitized) {
      return err(
        'validation_failed',
        'character payload is required and must include name, role, and description',
        400,
      );
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

    const storyContext = sanitizeStoryContext(storyContextRaw);
    const memory = optStr(memoryRaw, 4_000);
    const systemPrompt = buildSystemPrompt(sanitized, mode as ChatMode, storyContext, memory);

    // Build conversation history with caps to prevent abuse
    const apiMessages: Array<{ role: string; content: string }> = [];
    let historyChars = 0;
    if (Array.isArray(messages)) {
      const recent = messages.slice(-MAX_HISTORY_TURNS);
      for (const m of recent) {
        if (!m || typeof m.content !== 'string') continue;
        if (m.role !== 'user' && m.role !== 'character') continue;
        const content = m.content.slice(0, MAX_HISTORY_MSG_CHARS);
        if (historyChars + content.length > MAX_HISTORY_CHARS) break;
        historyChars += content.length;
        apiMessages.push({
          role: m.role === 'character' ? 'assistant' : 'user',
          content,
        });
      }
    }
    apiMessages.push({ role: 'user', content: message.trim() });

    // Stream the reply token-by-token. Insight generation is a separate,
    // client-initiated request (/api/character-chat/insight) so the reply is
    // never gated on — or lost to — the secondary call's latency.
    //
    // On success the response is a plain-text token stream; on failure it's the
    // usual JSON error envelope, so the client branches on res.ok. (An empty
    // stream is treated as an error client-side, where the accumulated text is
    // known.)
    const streamResult = await streamAnthropicText({
      apiKey,
      system: systemPrompt,
      messages: apiMessages,
      maxTokens: 2048,
      temperature: anthropicConfig.temperatures.characterChat,
      deadlineMs: CHAT_DEADLINE_MS,
    });

    if (!streamResult.ok) {
      if (streamResult.kind === 'timeout') return err('upstream_timeout', 'Chat request timed out', 504);
      if (streamResult.kind === 'rate_limited') return err('rate_limited', 'Rate limited by AI provider', 429);
      return err(statusToCode(streamResult.status), 'AI provider error', streamResult.status);
    }

    return new Response(streamResult.stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no', // disable proxy buffering so tokens flush live
      },
    });
  } catch (error: unknown) {
    log.error('Character chat API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to generate character response', status);
  }
}
