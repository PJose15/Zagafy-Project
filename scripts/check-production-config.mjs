/** Pre-deploy SaaS readiness check. Prints missing variable names, never values. */
const required = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY',
  'DATABASE_URL', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY',
  'NEXT_PUBLIC_APP_URL', 'CLERK_WEBHOOK_SECRET', 'CRON_SECRET',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_WRITER_MONTHLY', 'STRIPE_PRICE_WRITER_YEARLY',
  'STRIPE_PRICE_AUTHOR_MONTHLY', 'STRIPE_PRICE_AUTHOR_YEARLY',
];
const missing = required.filter(key => !process.env[key]?.trim());
if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'embed') missing.push('NEXT_PUBLIC_DEPLOYMENT_MODE must be saas for the paid launch');
if (missing.length) {
  console.error(`Production readiness failed:\n${missing.map(key => `  ${key}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Required SaaS launch configuration is present. Verify credentials and live integrations separately.');
}
