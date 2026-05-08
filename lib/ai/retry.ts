/**
 * Phase 3.3 / CB-10 — universal exponential-backoff retry for AI calls.
 *
 * Generalizes the inline 503-retry that lived inside extract-world-bible
 * into a shared helper. Default policy: 3 attempts, base 800ms, capped at
 * 8s, with ±20% jitter to avoid thundering-herd retries.
 */

export interface RetryAttemptInfo {
  attempt: number; // 1-based
  err: unknown;
  willRetry: boolean;
  nextDelayMs: number;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Pure function — must be stable across calls. */
  retryableErrors?: (err: unknown) => boolean;
  /** Observability hook. Called once per failed attempt. */
  onAttempt?: (info: RetryAttemptInfo) => void;
}

// Defaults match the original extract-world-bible inline retry.
// In test mode, collapse delays so suites don't spend seconds in setTimeout.
const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = isTest ? 1 : 800;
const DEFAULT_MAX_DELAY_MS = isTest ? 4 : 8_000;

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryable = opts.retryableErrors ?? isRetryableUpstream;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const willRetry = attempt < maxAttempts && retryable(err);
      const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);
      opts.onAttempt?.({ attempt, err, willRetry, nextDelayMs: willRetry ? delay : 0 });
      if (!willRetry) throw err;
      await sleep(delay);
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  throw lastErr;
}

function computeDelay(attempt: number, base: number, max: number): number {
  const exp = Math.min(base * 2 ** (attempt - 1), max);
  const jitter = (Math.random() * 0.4 - 0.2) * exp; // ±20%
  return Math.max(0, Math.floor(exp + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default retry predicate: 429 / 502 / 503 / 504 from any upstream, or
 * common transient transport errors. Recognizes Gemini's UNAVAILABLE and
 * Anthropic's 529 overloaded code.
 */
export function isRetryableUpstream(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; statusCode?: number; code?: string; message?: string; name?: string };
  const status = e.status ?? e.statusCode;
  if (status === 429 || status === 502 || status === 503 || status === 504 || status === 529) {
    return true;
  }
  if (typeof e.code === 'string') {
    if (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED') return true;
  }
  if (typeof e.message === 'string') {
    if (/\b(503|502|504|429|529)\b/.test(e.message)) return true;
    if (/UNAVAILABLE|overloaded|high demand|temporarily/i.test(e.message)) return true;
    if (/timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(e.message)) return true;
  }
  return false;
}
