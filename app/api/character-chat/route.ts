import { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry, isRetryableUpstream } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';
import { anthropicConfig } from '@/lib/ai-config';
import { buildSystemPrompt } from '@/lib/prompts/character-chat';
import type { Character, CharacterState } from '@/lib/store';
import type { ChatMode } from '@/lib/types/character-chat';

export const maxDuration = 30;

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

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/character-chat', requestId });
  const limited = await rateLimit(req, { maxRequests: 15, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { message, mode, character, messages, generateInsight } = body;

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
      return err('internal_error', 'Anthropic API key not configured', 500);
    }

    const systemPrompt = buildSystemPrompt(sanitized, mode as ChatMode);

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

    let response: Response;
    try {
      response = await withRetry(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), anthropicConfig.timeouts.characterChat);
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
                max_tokens: 2048,
                temperature: anthropicConfig.temperatures.characterChat,
                system: systemPrompt,
                messages: apiMessages,
              }),
              signal: controller.signal,
            });
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
          retryableErrors: (e) =>
            !(e instanceof Error && e.name === 'AbortError') && isRetryableUpstream(e),
        },
      );
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return err('upstream_timeout', 'Chat request timed out', 504);
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
    const reply = data.content?.[0]?.text?.trim() || '';

    type InsightError = 'timeout' | 'parse_error' | 'rate_limited' | 'upstream_error';
    const result: {
      reply: string;
      insight: string | null;
      insightError?: InsightError;
    } = { reply, insight: null };

    // Generate insight if requested and enough messages.
    // CB-09: when this optional secondary call fails, surface a structured
    // signal so the client can render "Insight unavailable" instead of a
    // phantom feature.
    if (generateInsight && Array.isArray(messages) && messages.length >= 5) {
      const insightController = new AbortController();
      const insightTimeout = setTimeout(
        () => insightController.abort(),
        anthropicConfig.timeouts.insight,
      );
      try {
        const transcript = apiMessages
          .map(m => `${m.role}: ${m.content}`)
          .join('\n')
          .slice(0, MAX_HISTORY_CHARS);

        const insightResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: anthropicConfig.model,
            max_tokens: 256,
            temperature: anthropicConfig.temperatures.characterInsight,
            system: 'You are a literary analyst. Extract character insights from conversations.',
            messages: [
              {
                role: 'user',
                content: `Analyze this conversation and extract ONE key insight about the character "${sanitized.name}":\n\n${transcript}\nassistant: ${reply}`,
              },
            ],
          }),
          signal: insightController.signal,
        });

        if (insightResponse.ok) {
          let insightData: { content?: Array<{ text?: string }> } | null = null;
          try {
            insightData = await insightResponse.json();
          } catch {
            log.warn('insight: parse-error on JSON body');
            result.insightError = 'parse_error';
          }
          if (insightData) {
            const text = insightData.content?.[0]?.text?.trim();
            if (text) {
              result.insight = text;
            } else {
              result.insightError = 'parse_error';
              log.warn('insight: empty/unrecognized response shape');
            }
          }
        } else if (insightResponse.status === 429) {
          result.insightError = 'rate_limited';
          log.warn('insight: rate-limited by upstream');
        } else {
          result.insightError = 'upstream_error';
          log.warn('insight: upstream non-ok', { status: insightResponse.status });
        }
      } catch (insightErr: unknown) {
        if (insightErr instanceof Error && insightErr.name === 'AbortError') {
          result.insightError = 'timeout';
          log.warn('insight: 15s timeout');
        } else {
          result.insightError = 'upstream_error';
          const msg = insightErr instanceof Error ? insightErr.message : String(insightErr);
          log.warn('insight: upstream throw', { errorMessage: msg });
        }
      } finally {
        clearTimeout(insightTimeout);
      }
    }

    return ok(result);
  } catch (error: unknown) {
    log.error('Character chat API error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to generate character response', status);
  }
}
