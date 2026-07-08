import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { callAnthropicMessages } from '@/lib/ai/anthropic';
import { buildLocaleBlock } from '@/lib/prompts/locale';

export const maxDuration = 30;

// Cross-session memory. After a conversation grows, the client asks for an
// updated running memory of what the character has learned/revealed. Persisted
// per session and fed back into the prompt so the character recalls past chats.
// Non-blocking: failure returns { memory: null, error } (HTTP 200).
const MEMORY_DEADLINE_MS = 22_000;
const MAX_TRANSCRIPT_CHARS = 30_000;
const MAX_EXISTING_MEMORY = 4_000;
const MAX_NAME = 200;
const MAX_MEMORY_OUT = 4_000;

type MemoryError = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/character-chat/memory', requestId });
  const limited = await rateLimit(req, { maxRequests: 20, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { characterName, transcript, existingMemory, language } = body;

    const lang = typeof language === 'string' && language.trim() ? language.trim() : 'English';
    const name = typeof characterName === 'string' ? characterName.trim().slice(0, MAX_NAME) : '';
    const text = typeof transcript === 'string' ? transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS) : '';
    const prior =
      typeof existingMemory === 'string' ? existingMemory.trim().slice(0, MAX_EXISTING_MEMORY) : '';
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
      system:
        'You maintain a concise running memory of what a fictional character has learned and revealed across conversations with one person. Given the prior memory and the latest conversation, produce an UPDATED memory: 4-8 short bullet points capturing durable facts the character revealed, promises or agreements made, the emotional tone of the relationship, and unresolved threads. Merge new developments into the prior memory; drop nothing important. Respond with ONLY the memory as bullet points — no preamble, no headings.' +
        `\n\n${buildLocaleBlock(lang)}`,
      messages: [
        {
          role: 'user',
          content: `Character: ${name}\n\nPrior memory:\n${prior || '(none yet)'}\n\nLatest conversation:\n${text}\n\nReturn the updated memory.`,
        },
      ],
      maxTokens: 500,
      temperature: 0.3,
      deadlineMs: MEMORY_DEADLINE_MS,
    });

    if (!result.ok) {
      const memoryError: MemoryError =
        result.kind === 'timeout'
          ? 'timeout'
          : result.kind === 'rate_limited'
            ? 'rate_limited'
            : 'upstream_error';
      log.warn('memory: upstream failure', { kind: result.kind });
      return ok({ memory: null, error: memoryError });
    }

    const memory = result.text.trim().slice(0, MAX_MEMORY_OUT);
    if (!memory) {
      return ok({ memory: null, error: 'parse_error' as MemoryError });
    }
    return ok({ memory, error: undefined });
  } catch (error: unknown) {
    log.error('Character chat memory API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to update memory', status);
  }
}
