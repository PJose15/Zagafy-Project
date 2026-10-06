// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { it, expect } from 'vitest';
const required=['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','CLERK_SECRET_KEY','DATABASE_URL','GEMINI_API_KEY','ANTHROPIC_API_KEY','NEXT_PUBLIC_APP_URL','CLERK_WEBHOOK_SECRET','CRON_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_WRITER_MONTHLY','STRIPE_PRICE_WRITER_YEARLY','STRIPE_PRICE_AUTHOR_MONTHLY','STRIPE_PRICE_AUTHOR_YEARLY'];
it.each([undefined,'embed'])('rejects missing or embed deployment mode even when all credentials are present: %s',mode=>{
 const env:NodeJS.ProcessEnv={NODE_ENV:'test',...Object.fromEntries(required.map(key=>[key,'PRIVATE_TEST_VALUE']))};if(mode)env.NEXT_PUBLIC_DEPLOYMENT_MODE=mode;
 const result=spawnSync(process.execPath,['scripts/check-production-config.mjs'],{env,encoding:'utf8'});expect(result.status).toBe(1);expect(result.stderr).toContain('NEXT_PUBLIC_DEPLOYMENT_MODE must be saas');expect(result.stderr).not.toContain('PRIVATE_TEST_VALUE');
});
it('accepts explicit SaaS configuration while leaving live credential verification separate',()=>{
 const env:NodeJS.ProcessEnv={NODE_ENV:'test',NEXT_PUBLIC_DEPLOYMENT_MODE:'saas',...Object.fromEntries(required.map(key=>[key,'PRIVATE_TEST_VALUE']))};
 const result=spawnSync(process.execPath,['scripts/check-production-config.mjs'],{env,encoding:'utf8'});expect(result.status).toBe(0);expect(result.stdout).toContain('Verify credentials and live integrations separately');expect(result.stdout).not.toContain('PRIVATE_TEST_VALUE');
});
