// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { stagingPreflight, validateStagingEnvironment } from '../../scripts/staging-preflight.mjs';
const env = { BASE_URL: 'https://staging.example.test', HEALTH_TOKEN: 'private-probe-value', STAGING_ISOLATED: 'true',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_a', CLERK_SECRET_KEY: 'sk_test_a',
  E2E_CLERK_USER_EMAIL: 'owner+clerk_test@example.test', E2E_CLERK_USER_PASSWORD: 'private-owner-value',
  E2E_OTHER_CLERK_USER_EMAIL: 'other+clerk_test@example.test', E2E_OTHER_CLERK_USER_PASSWORD: 'private-other-value',
  STAGING_EXPECTED_SHA: 'a'.repeat(40) };
describe('Staging preflight', () => {
  it.each([{ STAGING_ISOLATED: '' }, { BASE_URL: 'http://localhost:3000' }, { BASE_URL: 'https://user:password@example.test' },
    { CLERK_SECRET_KEY: 'sk_live_real' }, { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_real' },
    { E2E_OTHER_CLERK_USER_EMAIL: env.E2E_CLERK_USER_EMAIL }, { E2E_CLERK_USER_EMAIL: 'real@example.test' },
    { STAGING_EXPECTED_SHA: 'short' }, { HEALTH_TOKEN: '' }])('refuses unsafe/incomplete configuration before any network call: %j', async patch => {
    const fetcher = vi.fn(); await expect(stagingPreflight({ ...env, ...patch }, fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts only the expected release commit and sends the probe token in a header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { ready: true, scope: 'cloud-history-acceptance', commit: env.STAGING_EXPECTED_SHA } })));
    expect(await stagingPreflight(env, fetcher)).toEqual({scope:'cloud-history-acceptance',commit:env.STAGING_EXPECTED_SHA});
    expect(fetcher.mock.calls[0][0]).toBe('https://staging.example.test/api/health/readiness');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { 'x-health-token': env.HEALTH_TOKEN }, redirect: 'error' });
  });
  it.each([{ ok: true, data: { ready: true, scope: 'cloud-history-acceptance', commit: 'b'.repeat(40) } },
    { ok: false, data: { ready: false } }, { ok: true, data: { ready: true, scope: 'other', commit: env.STAGING_EXPECTED_SHA } }])('rejects wrong commit and false readiness: %j', async body => {
      await expect(stagingPreflight(env, vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))).rejects.toThrow();
  });
  it('validation errors never disclose configuration values', () => {
    expect(() => validateStagingEnvironment({...env,CLERK_SECRET_KEY:'SECRET_MUST_NOT_APPEAR'})).toThrow('Only Clerk development-instance keys are allowed');
  });
});
