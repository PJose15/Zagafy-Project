import { NextRequest, NextResponse } from 'next/server';
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
    return NextResponse.json(
      { error: 'Health probe disabled. Set HEALTH_TOKEN in production to enable.' },
      { status: 503 },
    );
  }

  if (required) {
    const provided = req.headers.get('x-health-token');
    if (provided !== required) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.json({
    timestamp: Date.now(),
    mode: getRateLimitMode(),
    ...getRateLimitHealth(),
  });
}
