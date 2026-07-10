import { NextRequest } from 'next/server';
import { ok, err, makeRequestId } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { isDatabaseConfigured } from '@/db/client';
import { runOnboardingDrip } from '@/lib/onboarding-emails';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/onboarding
 *
 * Daily onboarding drip (day 1 / 3 / 7 emails), invoked by Vercel Cron
 * (schedule in vercel.json — Vercel sends GET with
 * `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set on the project).
 *
 * Auth: requires the CRON_SECRET bearer token. In production a missing
 * CRON_SECRET is a config error (500) — the route must never be publicly
 * triggerable. In dev/test an unset secret leaves the route open for local runs.
 */
export async function GET(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/cron/onboarding', requestId });

  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
  if (!secret) {
    if (isProd) {
      log.error('CRON_SECRET not configured');
      return err('internal_error', 'Cron not configured', 500, undefined, { requestId });
    }
    log.warn('CRON_SECRET unset — allowing cron request (dev/test only)');
  } else if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    log.warn('cron request rejected — bad or missing bearer token');
    return err('unauthorized', 'Invalid cron authorization', 401, undefined, { requestId });
  }

  if (!isDatabaseConfigured()) {
    log.error('DATABASE_URL not configured');
    return err('internal_error', 'Database not configured', 500, undefined, { requestId });
  }

  try {
    const counts = await runOnboardingDrip();
    log.info('onboarding drip complete', { ...counts });
    return ok(counts, { requestId });
  } catch (e) {
    log.error('onboarding drip failed', e);
    return err('internal_error', 'Onboarding drip failed', 500, undefined, { requestId });
  }
}
