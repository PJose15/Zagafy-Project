import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { err } from '@/lib/api-response';
import { getLimits } from '@/lib/billing';
import { getUserPlan } from '@/lib/get-user-plan';
import type { AuthedUser } from '@/lib/auth';

/**
 * A single Redis script reserves monthly allowance and sets its expiry atomically.
 * Production always fails closed on absent/unreachable Redis (HTTP 503), including
 * explicit embed deployments, which share a bounded free-plan budget. Local
 * development may operate without Redis. Exhaustion is distinct (HTTP 429).
 * Character-chat helpers do not consume another turn: lib/ai-turn binds each
 * helper to a metered main turn with one atomic claim per helper and a short TTL.
 */

const TTL_SECONDS = 35 * 24 * 60 * 60; // ~35 days, outlives any calendar month
const RESERVE_QUOTA = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then return -1 end
count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return count
`;

/** Redis key for a user's current-month AI call counter (UTC month). */
function quotaKey(userId: string, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `aiq:${userId}:${y}-${m}`;
}

function isUpstashConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Count one AI call for the user and check it against their plan's monthly
 * allowance. Returns `{ allowed: false }` once the allowance is exhausted.
 */
type QuotaResult = { allowed: boolean; remaining?: number; unavailable?: boolean };

function unavailableQuota(): QuotaResult {
  return process.env.NODE_ENV === 'production'
    ? { allowed: false, unavailable: true }
    : { allowed: true };
}

export async function checkAiQuota(
  userId: string,
): Promise<QuotaResult> {
  if (!isUpstashConfigured()) {
    return unavailableQuota();
  }

  try {
    const plan = await getUserPlan(userId);
    const limit = getLimits(plan).aiCallsPerMonth;
    if (!Number.isFinite(limit)) return { allowed: true };

    const redis = Redis.fromEnv();
    const key = quotaKey(userId);
    const count = Number(await redis.eval(RESERVE_QUOTA, [key], [limit, TTL_SECONDS]));
    if (count === -1 || count > limit) return { allowed: false, remaining: 0 };
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid quota result');
    return { allowed: true, remaining: limit - count };
  } catch {
    return unavailableQuota();
  }
}

/** Read-only usage display. Never authorizes a paid helper; use enforceAiSidecar. */
export async function peekAiQuota(
  userId: string,
): Promise<QuotaResult> {
  if (!isUpstashConfigured()) {
    return unavailableQuota();
  }
  try {
    const plan = await getUserPlan(userId);
    const limit = getLimits(plan).aiCallsPerMonth;
    if (!Number.isFinite(limit)) return { allowed: true };
    const redis = Redis.fromEnv();
    const current = Number(await redis.get(quotaKey(userId))) || 0;
    return { allowed: current < limit };
  } catch {
    return unavailableQuota();
  }
}

/**
 * Route helper: returns a 429 response when the user's monthly AI allowance is
 * used up, or null when the call may proceed. Call AFTER auth + rate limiting.
 * Local development embed mode is unmetered; production embeds share a budget.
 */
export async function enforceAiQuota(
  user: AuthedUser,
  init?: { requestId?: string },
): Promise<NextResponse | null> {
  if (user.embedMode && process.env.NODE_ENV !== 'production') return null;
  const { allowed, unavailable } = await checkAiQuota(user.userId);
  if (unavailable) return quotaUnavailable(init);
  if (allowed) return null;
  return quotaExceeded(init);
}

/**
 * Sidecar helper: returns a 429 when the user is ALREADY over quota, without
 * counting this call. `null` means proceed. Embed mode is never metered.
 */
export async function enforceAiQuotaPeek(
  user: AuthedUser,
  init?: { requestId?: string },
): Promise<NextResponse | null> {
  if (user.embedMode && process.env.NODE_ENV !== 'production') return null;
  const { allowed, unavailable } = await peekAiQuota(user.userId);
  if (unavailable) return quotaUnavailable(init);
  if (allowed) return null;
  return quotaExceeded(init);
}

export function quotaUnavailable(init?: { requestId?: string }): NextResponse {
  return err('upstream_unavailable', 'AI usage limits are temporarily unavailable. Please try again shortly.', 503, undefined, init);
}

function quotaExceeded(init?: { requestId?: string }): NextResponse {
  return err(
    'quota_exceeded',
    'Your monthly AI allowance is used up. Upgrade your plan for a higher limit, or wait until next month when your quota resets.',
    429,
    undefined,
    init,
  );
}
