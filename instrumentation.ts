export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    const { validateRateLimitConfig } = await import('@/lib/rate-limit');
    validateRateLimitConfig();

    if (process.env.ANTHROPIC_API_KEY) {
      const { anthropicConfig } = await import('@/lib/ai-config');
      console.log(`[Zagafy] Anthropic model: ${anthropicConfig.model}`);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
