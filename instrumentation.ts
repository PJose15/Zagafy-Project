export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateRateLimitConfig } = await import('@/lib/rate-limit');
    validateRateLimitConfig();

    if (process.env.ANTHROPIC_API_KEY) {
      const { anthropicConfig } = await import('@/lib/ai-config');
      console.log(`[Zagafy] Anthropic model: ${anthropicConfig.model}`);
    }
  }
}
