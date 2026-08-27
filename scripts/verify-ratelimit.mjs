#!/usr/bin/env node
/**
 * Verify the deployed rate-limit subsystem is running on Upstash (not the
 * per-lambda memory fallback). Hits the gated /api/health/rate-limit probe.
 *
 * Usage:
 *   npm run verify:ratelimit -- --url https://your-domain --token <HEALTH_TOKEN>
 * Env fallbacks: VERIFY_URL, HEALTH_TOKEN.
 */

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const base = (arg('url') ?? process.env.VERIFY_URL ?? '').replace(/\/$/, '');
const token = arg('token') ?? process.env.HEALTH_TOKEN ?? '';

if (!base) {
  console.error('Missing --url (or VERIFY_URL). e.g. --url https://zagafy.vercel.app');
  process.exit(2);
}

const url = `${base}/api/health/rate-limit`;
try {
  const res = await fetch(url, { headers: token ? { 'X-Health-Token': token } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ ${res.status} from ${url}:`, JSON.stringify(body));
    console.error('  (403 = wrong/absent HEALTH_TOKEN; 503 = HEALTH_TOKEN not set in prod)');
    process.exit(1);
  }
  const mode = body?.data?.mode ?? body?.mode;
  const breaker = body?.data?.breakerState ?? body?.breakerState;
  console.log(`mode=${mode} breakerState=${breaker}`);
  if (mode === 'upstash') {
    console.log('✓ Distributed rate limiting + AI quota are ACTIVE.');
    process.exit(0);
  }
  console.error(`✗ Expected mode "upstash" but got "${mode}". Set UPSTASH_REDIS_REST_URL/_TOKEN in Vercel and redeploy.`);
  process.exit(1);
} catch (e) {
  console.error('✗ Request failed:', e?.message ?? e);
  process.exit(1);
}
