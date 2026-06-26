import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 },
  );
}

function serviceUnavailableResponse(reason: string): NextResponse {
  return NextResponse.json(
    { error: 'Rate limiter unavailable. Service is temporarily disabled.', reason },
    { status: 503 },
  );
}

// ─── Mode resolution ──────────────────────────────────────────────
// Re-evaluated on each call so tests can flip env vars between cases.
// - 'upstash':  UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
// - 'memory':   fallback when Upstash is absent (development, test, and—by
//               default—production). On serverless the in-memory limiter is
//               per-instance, so it's weaker than Upstash but keeps the app
//               functional instead of rejecting every request.
// - 'disabled': production with no Upstash AND opt-in RATE_LIMIT_STRICT=true —
//               every request 503s (fail closed). Use once Upstash is wired up
//               to guarantee distributed limiting can never silently vanish.

export type RateLimitMode = 'upstash' | 'memory' | 'disabled';

/** Determine the active rate-limiting strategy based on environment configuration. */
export function getRateLimitMode(): RateLimitMode {
  const hasUpstash = !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  if (hasUpstash) return 'upstash';
  // Opt-in hard fail: only 503 in production without Upstash when explicitly
  // requested. Keeps the strict posture available without making it the default
  // that silently takes the whole app offline when an env var is missing.
  if (process.env.NODE_ENV === 'production' && process.env.RATE_LIMIT_STRICT === 'true') {
    return 'disabled';
  }
  // Default everywhere else (including production): degrade to the in-memory
  // limiter rather than 503-ing every request.
  return 'memory';
}

// ─── Upstash limiter cache ────────────────────────────────────────
const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(maxRequests: number, windowMs: number): Ratelimit {
  const key = `${maxRequests}:${windowMs}`;
  const cached = upstashLimiters.get(key);
  if (cached) return cached;

  const windowSec = Math.ceil(windowMs / 1000);
  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
    prefix: 'ratelimit',
  });

  upstashLimiters.set(key, limiter);
  return limiter;
}

// ─── Circuit breaker ──────────────────────────────────────────────
// If Upstash returns errors 3 times within 30s, the breaker opens for 60s
// and every rate-limited endpoint returns 503 instead of contacting Upstash.
// After 60s a single half-open probe is allowed; success closes the breaker,
// failure re-opens it.

type BreakerState = 'closed' | 'open' | 'half-open';

const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 30_000;
const OPEN_DURATION_MS = 60_000;

interface BreakerSnapshot {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt: number;
  lastError: string | null;
  lastErrorAt: number | null;
}

const breaker: BreakerSnapshot = {
  state: 'closed',
  consecutiveFailures: 0,
  openedAt: 0,
  lastError: null,
  lastErrorAt: null,
};
let firstFailureAt = 0;

function shouldAttemptUpstream(now: number): boolean {
  if (breaker.state === 'closed' || breaker.state === 'half-open') return true;
  // open
  if (now - breaker.openedAt > OPEN_DURATION_MS) {
    breaker.state = 'half-open';
    return true;
  }
  return false;
}

function recordUpstreamFailure(err: unknown, now: number): void {
  breaker.lastError = err instanceof Error ? err.message : String(err);
  breaker.lastErrorAt = now;

  if (breaker.state === 'half-open') {
    breaker.state = 'open';
    breaker.openedAt = now;
    return;
  }

  if (breaker.consecutiveFailures === 0 || now - firstFailureAt > FAILURE_WINDOW_MS) {
    breaker.consecutiveFailures = 1;
    firstFailureAt = now;
  } else {
    breaker.consecutiveFailures += 1;
  }

  if (breaker.consecutiveFailures >= FAILURE_THRESHOLD) {
    breaker.state = 'open';
    breaker.openedAt = now;
  }
}

function recordUpstreamSuccess(): void {
  breaker.state = 'closed';
  breaker.consecutiveFailures = 0;
  firstFailureAt = 0;
}

/** Test-only: reset breaker state between cases. */
export function _resetCircuitBreakerForTests(): void {
  breaker.state = 'closed';
  breaker.consecutiveFailures = 0;
  breaker.openedAt = 0;
  breaker.lastError = null;
  breaker.lastErrorAt = null;
  firstFailureAt = 0;
}

export interface RateLimitHealth {
  reachable: boolean;
  breakerState: BreakerState;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: number | null;
}

/** Return a snapshot of the circuit breaker's current health status. */
export function getRateLimitHealth(): RateLimitHealth {
  return {
    reachable: breaker.state !== 'open',
    breakerState: breaker.state,
    consecutiveFailures: breaker.consecutiveFailures,
    lastError: breaker.lastError,
    lastErrorAt: breaker.lastErrorAt,
  };
}

// ─── In-memory limiter (dev / test only) ──────────────────────────
const memoryStore = new Map<string, number[]>();
const MAX_STORE_KEYS = 10000;
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60000;

function cleanupMemoryStore(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, timestamps] of memoryStore) {
    const valid = timestamps.filter(t => now - t < windowMs);
    if (valid.length === 0) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, valid);
    }
  }

  if (memoryStore.size > MAX_STORE_KEYS) {
    const excess = memoryStore.size - MAX_STORE_KEYS;
    const keys = memoryStore.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next();
      if (value) memoryStore.delete(value);
    }
  }
}

function memoryRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  cleanupMemoryStore(windowMs);
  const now = Date.now();
  const timestamps = (memoryStore.get(key) || []).filter(t => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    memoryStore.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  memoryStore.set(key, timestamps);
  return true;
}

// ─── Startup banner ───────────────────────────────────────────────
/**
 * Validate rate-limit configuration at startup.
 * In production with Upstash missing, prints an unmissable banner. By default
 * the server degrades to the in-memory limiter (still functional); with
 * RATE_LIMIT_STRICT=true it fails closed and every endpoint responds 503.
 */
export function validateRateLimitConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const mode = getRateLimitMode();
  if (mode === 'upstash') return;

  if (mode === 'disabled') {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  ✗  RATE LIMITING DISABLED — UPSTASH NOT CONFIGURED (STRICT)    ║
║                                                                  ║
║  RATE_LIMIT_STRICT=true but UPSTASH_REDIS_REST_URL / _TOKEN are  ║
║  missing. Every rate-limited endpoint will respond 503 until     ║
║  the Upstash env vars are set in the Vercel project.             ║
║                                                                  ║
║  → Set the Upstash env vars and redeploy.                        ║
╚══════════════════════════════════════════════════════════════════╝
`);
    return;
  }

  // mode === 'memory' in production: degraded but functional.
  console.warn(`
╔══════════════════════════════════════════════════════════════════╗
║  ⚠  RATE LIMITING DEGRADED — UPSTASH NOT CONFIGURED            ║
║                                                                  ║
║  Falling back to an in-memory limiter. On serverless this is     ║
║  per-instance — counters don't span lambdas, so limits are       ║
║  looser than intended. The app remains fully functional.         ║
║                                                                  ║
║  → Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for     ║
║    robust distributed limiting (recommended for production).     ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

// ─── Public entry point ───────────────────────────────────────────
/**
 * Check rate limit for a request. Returns null if allowed, or a 429/503
 * NextResponse if blocked. 503 is returned when the rate limiter itself
 * is unavailable (production without Upstash, or open circuit breaker).
 */
export async function rateLimit(
  req: NextRequest,
  { maxRequests = 10, windowMs = 60000 }: { maxRequests?: number; windowMs?: number } = {},
): Promise<NextResponse | null> {
  const ip = getClientIP(req);
  const key = `${ip}:${req.nextUrl.pathname}`;
  const mode = getRateLimitMode();

  if (mode === 'disabled') {
    return serviceUnavailableResponse('upstash-not-configured');
  }

  if (mode === 'memory') {
    const allowed = memoryRateLimit(key, maxRequests, windowMs);
    if (!allowed) return rateLimitResponse();
    return null;
  }

  // upstash mode — wrap with circuit breaker
  const now = Date.now();
  if (!shouldAttemptUpstream(now)) {
    return serviceUnavailableResponse('circuit-open');
  }

  try {
    const limiter = getUpstashLimiter(maxRequests, windowMs);
    const { success } = await limiter.limit(key);
    recordUpstreamSuccess();
    if (!success) return rateLimitResponse();
    return null;
  } catch (err) {
    recordUpstreamFailure(err, now);
    return serviceUnavailableResponse('upstash-unreachable');
  }
}
