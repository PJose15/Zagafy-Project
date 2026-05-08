import { ok } from '@/lib/api-response';
import { getRateLimitMode, getRateLimitHealth } from '@/lib/rate-limit';

export function GET() {
  const mode = getRateLimitMode();
  const { reachable } = getRateLimitHealth();
  // Public surface: a single boolean per concern. Detailed health is on
  // /api/health/rate-limit, gated by HEALTH_TOKEN.
  return ok({
    status: 'ok',
    timestamp: Date.now(),
    rateLimit: {
      mode,
      reachable: mode === 'memory' ? true : reachable,
    },
  });
}
