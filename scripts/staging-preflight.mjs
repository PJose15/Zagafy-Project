import { pathToFileURL } from 'node:url';

/** Validate before any browser or fixture write. Errors contain names, never values. */
export function validateStagingEnvironment(env) {
  const missing = ['BASE_URL','HEALTH_TOKEN','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','CLERK_SECRET_KEY',
    'E2E_CLERK_USER_EMAIL','E2E_CLERK_USER_PASSWORD','E2E_OTHER_CLERK_USER_EMAIL','E2E_OTHER_CLERK_USER_PASSWORD']
    .filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing staging variables: ${missing.join(', ')}`);
  if (env.STAGING_ISOLATED !== 'true') throw new Error('STAGING_ISOLATED must attest a dedicated staging database and test accounts');
  let url;
  try { url = new URL(env.BASE_URL); } catch { throw new Error('BASE_URL must be a staging HTTPS origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('BASE_URL must be a staging HTTPS origin without credentials or a path');
  }
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_test_') || !env.CLERK_SECRET_KEY.startsWith('sk_test_')) {
    throw new Error('Only Clerk development-instance keys are allowed');
  }
  const emails = [env.E2E_CLERK_USER_EMAIL, env.E2E_OTHER_CLERK_USER_EMAIL].map(email => email.trim().toLowerCase());
  if (emails[0] === emails[1] || emails.some(email => !email.includes('+clerk_test@'))) {
    throw new Error('Two distinct dedicated +clerk_test accounts are required');
  }
  const commit = env.STAGING_EXPECTED_SHA || env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('STAGING_EXPECTED_SHA must identify the full release commit');
  return { origin: url.origin, commit };
}

/** @param {Record<string, string | undefined>} env
 * @param {typeof fetch} fetcher */
export async function stagingPreflight(env = process.env, fetcher = fetch) {
  const expected = validateStagingEnvironment(env);
  const response = await fetcher(`${expected.origin}/api/health/readiness`, {
    headers: { 'x-health-token': env.HEALTH_TOKEN }, redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true || body.data?.ready !== true || body.data?.scope !== 'cloud-history-acceptance') {
    throw new Error('Staging cloud readiness failed; inspect the protected readiness probe and configuration');
  }
  if (body.data.commit !== expected.commit) throw new Error('Staging deployment does not match the release commit');
  return { scope: body.data.scope, commit: expected.commit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await stagingPreflight(); console.log(`Staging cloud preflight passed on ${result.commit}.`); }
  catch { console.error('Staging preflight failed. Check required configuration, isolated preview attestation, schema and release commit.'); process.exitCode = 1; }
}
