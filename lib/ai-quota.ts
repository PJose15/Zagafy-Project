import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { err } from '@/lib/api-response';
import { getLimits } from '@/lib/billing';
import { getUserPlan } from '@/lib/get-user-plan';
import type { AuthedUser } from '@/lib/auth';

/**
 * Monthly AI-call quota, enforced per user against PLAN_LIMITS.aiCallsPerMonth.
 *
 * Counting uses a single Upstash Redis INCR on `aiq:<userId>:<YYYY-MM>` so it
 * is atomic across serverless instances. The key expires after ~35 days —
 * longer than any calendar month, so a live month is never evicted while the
 * previous month's key cleans itself up.
 *
 * Fail-open posture mirrors lib/rate-limit.ts: when Upstash is unconfigured
 * (or unreachable) the quota is not enforced, unless the deployment opted into
 * strict mode with RATE_LIMIT_STRICT=true in production — then it fails closed.
 *
 * Metered routes: chat, ingest, audit, analyze-character, extract-world-bible,
 * micro-prompt, polish, closing-question, story-coach, character-chat (main),
 * and all six publishing/* routes. The four auxiliary character-chat routes
 * (state / insight / contradiction / memory) are deliberately NOT metered:
 * they are fire-and-forget sidecars of a single chat turn, and counting them
 * would bill one user-visible turn up to 4x.
 */

const TTL_SECONDS = 35 * 24 * 60 * 60; // ~35 days, outlives any calendar month

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
export async function checkAiQuota(
  userId: string,
): Promise<{ allowed: boolean; remaining?: number }> {
  if (!isUpstashConfigured()) {
    // Same posture as the rate limiter: without Upstash we cannot count across
    // serverless instances, so we fail open — unless the deployment explicitly
    // opted into strict fail-closed behavior.
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.RATE_LIMIT_STRICT === 'true'
    ) {
      return { allowed: false };
    }
    return { allowed: true };
  }

  try {
    const plan = await getUserPlan(userId);
    const limit = getLimits(plan).aiCallsPerMonth;
    if (!Number.isFinite(limit)) return { allowed: true };

    const redis = Redis.fromEnv();
    const key = quotaKey(userId);
    const count = await redis.incr(key);
    if (count === 1) {
      // First call this month — arm the TTL so stale months self-clean.
      await redis.expire(key, TTL_SECONDS);
    }
    if (count > limit) return { allowed: false, remaining: 0 };
    return { allowed: true, remaining: limit - count };
  } catch {
    // Upstash unreachable — fail open, matching the rate limiter's posture.
    return { allowed: true };
  }
}

/**
 * Route helper: returns a 429 response when the user's monthly AI allowance is
 * used up, or null when the call may proceed. Call AFTER auth + rate limiting.
 * Embed mode (self-hosted, no billing) is never metered.
 */
export async function enforceAiQuota(
  user: AuthedUser,
  init?: { requestId?: string },
): Promise<NextResponse | null> {
  if (user.embedMode) return null;
  const { allowed } = await checkAiQuota(user.userId);
  if (allowed) return null;
  return err(
    'quota_exceeded',
    'Your monthly AI allowance is used up. Upgrade your plan for a higher limit, or wait until next month when your quota resets.',
    429,
    undefined,
    init,
  );
}
