import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

function getClientIP(req: NextRequest): string {
  // Prefer platform-set headers. On Vercel, x-vercel-forwarded-for and x-real-ip
  // are written by the edge and overwrite any client-supplied value, so they are
  // not spoofable by the caller.
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) {
    const first = vercel.split(',')[0]?.trim();
    if (first) return first;
  }

  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;

  // Fall back to the RIGHT-most x-forwarded-for entry. That hop is appended by the
  // nearest trusted proxy; the LEFT-most value is fully client-controlled and can be
  // rotated per request to mint a fresh rate-limit bucket every time (the bypass).
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1]!;
  }

  return 'unknown';
}

// Global, IP-independent ceiling per route+window. Backstops two failure modes the
// per-IP limiter cannot cover on its own: (1) a client spoofing X-Forwarded-For to
// rotate per-IP buckets, and (2) the in-memory limiter silently no-opping when
// Upstash is unconfigured in production. This bounds worst-case AI spend per
// serverless instance regardless of the client's claimed identity.
const GLOBAL_CEILING_MULTIPLIER = 50;
const globalStore = new Map<string, number[]>();

function globalCeilingExceeded(pathname: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${pathname}:${windowMs}`;
  const limit = maxRequests * GLOBAL_CEILING_MULTIPLIER;
  const timestamps = (globalStore.get(key) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= limit) {
    globalStore.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  globalStore.set(key, timestamps);
  return false;
}

function rateLimitResponse() {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  );
}

// --- Upstash Redis rate limiter (production / Vercel) ---
const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(maxRequests: number, windowMs: number): Ratelimit {
  const key = `${maxRequests}:${windowMs}`;
  if (upstashLimiters.has(key)) return upstashLimiters.get(key)!;

  const windowSec = Math.ceil(windowMs / 1000);
  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
    prefix: 'ratelimit',
  });

  upstashLimiters.set(key, limiter);
  return limiter;
}

// --- In-memory rate limiter (local development) ---
let hasWarnedMemory = false;
const memoryStore = new Map<string, number[]>();
const MAX_STORE_KEYS = 10000;
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60000; // 1 minute

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

  // Hard cap: if still too large, drop oldest entries
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

/**
 * Validate rate-limit configuration at startup.
 * Logs a prominent ASCII banner warning when Upstash is not configured in production.
 */
export function validateRateLimitConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (hasUpstash) return;

  console.warn(`
╔══════════════════════════════════════════════════════════════╗
║  ⚠  RATE LIMITING: UPSTASH NOT CONFIGURED                  ║
║                                                              ║
║  UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are     ║
║  missing. The server is using an in-memory rate limiter      ║
║  that does NOT persist across serverless invocations.        ║
║                                                              ║
║  This means rate limiting is effectively DISABLED on Vercel. ║
║                                                              ║
║  → Set Upstash env vars in your Vercel project settings.     ║
╚══════════════════════════════════════════════════════════════╝
`);
}

/**
 * Check rate limit for a request.
 * Uses Upstash Redis in production (when UPSTASH env vars are set),
 * falls back to in-memory for local development.
 * Returns null if allowed, or a 429 NextResponse if rate limited.
 */
export async function rateLimit(
  req: NextRequest,
  { maxRequests = 10, windowMs = 60000 }: { maxRequests?: number; windowMs?: number } = {}
): Promise<NextResponse | null> {
  const ip = getClientIP(req);
  const key = `${ip}:${req.nextUrl.pathname}`;

  // IP-independent backstop: enforce an absolute per-instance ceiling before the
  // per-IP check, so a spoofed/rotated IP (or a disabled Upstash limiter) still
  // cannot drive unbounded requests to an expensive route.
  if (globalCeilingExceeded(req.nextUrl.pathname, maxRequests, windowMs)) {
    return rateLimitResponse();
  }

  if (hasUpstash) {
    const limiter = getUpstashLimiter(maxRequests, windowMs);
    const { success } = await limiter.limit(key);
    if (!success) return rateLimitResponse();
  } else {
    if (!hasWarnedMemory && process.env.NODE_ENV === 'production') {
      hasWarnedMemory = true;
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set. ' +
        'Using in-memory rate limiter, which does not persist across serverless invocations. ' +
        'Set Upstash env vars for production rate limiting.'
      );
    }
    const allowed = memoryRateLimit(key, maxRequests, windowMs);
    if (!allowed) return rateLimitResponse();
  }

  return null;
}
