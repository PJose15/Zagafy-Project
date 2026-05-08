import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { getRateLimitMode, getRateLimitHealth } from '@/lib/rate-limit';

/**
 * Protected health probe for rate-limit subsystem. Returns mode, breaker
 * state, consecutive failure count, and last error message.
 *
 * Gating:
 *  - In production, HEALTH_TOKEN must be set and matched via X-Health-Token.
 *  - In dev/test, HEALTH_TOKEN is optional; when set it is still enforced.
 */
export function GET(req: NextRequest) {
  const required = process.env.HEALTH_TOKEN ?? '';
  const inProduction = process.env.NODE_ENV === 'production';

  if (inProduction && !required) {
    return err(
      'upstream_unavailable',
      'Health probe disabled. Set HEALTH_TOKEN in production to enable.',
      503,
    );
  }

  if (required) {
    const provided = req.headers.get('x-health-token');
    if (provided !== required) {
      return err('forbidden', 'Forbidden', 403);
    }
  }

  return ok({
    timestamp: Date.now(),
    mode: getRateLimitMode(),
    ...getRateLimitHealth(),
  });
}
