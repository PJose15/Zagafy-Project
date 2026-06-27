import { ok } from '@/lib/api-response';
import { getRateLimitMode, getRateLimitHealth } from '@/lib/rate-limit';

export function GET() {
  const mode = getRateLimitMode();
  const { reachable } = getRateLimitHealth();
  // Public surface: a single boolean per concern. Detailed health is on
  // /api/health/rate-limit, gated by HEALTH_TOKEN.
  // `ai` reports only whether each provider key is PRESENT (never the value),
  // so config gaps (e.g. a missing/mis-scoped ANTHROPIC_API_KEY) are diagnosable
  // without attempting a full generation.
  return ok({
    status: 'ok',
    timestamp: Date.now(),
    rateLimit: {
      mode,
      reachable: mode === 'memory' ? true : reachable,
    },
    ai: {
      gemini: !!process.env.GEMINI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
    },
  });
}
