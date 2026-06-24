/**
 * Shared Anthropic Messages API caller for the character-chat routes.
 *
 * Why this exists: the previous inline `fetch` gave each retry attempt the full
 * 30s abort window, so a single 529 retry could run ~60s under a 30s serverless
 * `maxDuration` and get the whole function killed. This helper enforces a single
 * wall-clock deadline across all attempts and refuses to start a retry it can't
 * finish, so the call always returns within the function's time budget.
 *
 * It also (a) omits sampling params on models that reject them and (b) extracts
 * the first *text* block rather than assuming `content[0]`, so an ANTHROPIC_MODEL
 * upgrade to Opus 4.7+/Fable (no `temperature`, thinking-block first) doesn't
 * 400 or return an empty reply.
 */
import { withRetry, isRetryableUpstream } from '@/lib/ai/retry';
import { anthropicConfig } from '@/lib/ai-config';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Newer Claude models (Opus 4.7+, Fable) reject `temperature`/`top_p`/`top_k`
 * with a 400. Keep sampling params only for models known to accept them so an
 * `ANTHROPIC_MODEL` upgrade doesn't break every request.
 */
export function supportsSamplingParams(model: string): boolean {
  return !/(opus-4-[789]|opus-[5-9]|fable)/i.test(model);
}

/**
 * Pull the first text block out of an Anthropic response, skipping leading
 * thinking blocks (which adaptive-thinking models emit before the text).
 * Tolerates the test/legacy shape `{ content: [{ text }] }` with no `type`.
 */
export function extractText(raw: unknown): string {
  const blocks = (raw as { content?: unknown } | null)?.content;
  if (!Array.isArray(blocks)) return '';
  for (const b of blocks) {
    if (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string') {
      const block = b as { type?: unknown; text: string };
      if (block.type === undefined || block.type === 'text') return block.text.trim();
    }
  }
  return '';
}

export type AnthropicResult =
  | { ok: true; text: string; raw: unknown }
  | { ok: false; kind: 'timeout' | 'rate_limited' | 'upstream'; status: number };

interface CallParams {
  apiKey: string;
  model?: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature?: number;
  /** Total wall-clock budget across all attempts (ms). Must be < maxDuration. */
  deadlineMs: number;
  /** Per-attempt abort ceiling (ms). Clamped to the remaining budget. */
  perAttemptMs?: number;
  maxAttempts?: number;
}

export async function callAnthropicMessages(params: CallParams): Promise<AnthropicResult> {
  const {
    apiKey,
    model = anthropicConfig.model,
    system,
    messages,
    maxTokens,
    temperature,
    deadlineMs,
    perAttemptMs = 15_000,
    maxAttempts = 2,
  } = params;

  const deadline = Date.now() + deadlineMs;

  const body: Record<string, unknown> = { model, max_tokens: maxTokens, system, messages };
  if (temperature !== undefined && supportsSamplingParams(model)) {
    body.temperature = temperature;
  }

  try {
    const response = await withRetry(
      async () => {
        const remaining = deadline - Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(perAttemptMs, remaining)));
        try {
          const r = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
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
        maxAttempts,
        maxDelayMs: 3_000,
        // Don't retry past the abort, and don't start a retry we can't finish
        // inside the wall-clock budget.
        retryableErrors: (e) =>
          !(e instanceof Error && e.name === 'AbortError') &&
          isRetryableUpstream(e) &&
          Date.now() < deadline - 2_000,
      },
    );

    if (!response.ok) {
      if (response.status === 429) return { ok: false, kind: 'rate_limited', status: 429 };
      return { ok: false, kind: 'upstream', status: response.status };
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return { ok: false, kind: 'upstream', status: 502 };
    }
    return { ok: true, text: extractText(raw), raw };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, kind: 'timeout', status: 504 };
    }
    if (e && typeof e === 'object' && 'status' in e) {
      const status = Number((e as { status: number }).status);
      if (status === 429) return { ok: false, kind: 'rate_limited', status: 429 };
      return { ok: false, kind: 'upstream', status };
    }
    return { ok: false, kind: 'upstream', status: 500 };
  }
}
