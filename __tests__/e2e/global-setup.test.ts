// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';

const calls = vi.hoisted(() => ({ execFileSync: vi.fn(), clerkSetup: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: calls.execFileSync }));
vi.mock('@clerk/testing/playwright', () => ({ clerkSetup: calls.clerkSetup }));
import setup from '../../e2e/global-setup';

beforeEach(() => {
  calls.execFileSync.mockReset();
  calls.clerkSetup.mockReset();
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_a');
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_a');
  vi.stubEnv('E2E_REQUIRE_CLOUD', 'false');
});
afterEach(() => vi.unstubAllEnvs());

it('keeps ordinary authenticated setup independent from the staging-only CLI', async () => {
  await setup();
  expect(calls.execFileSync).not.toHaveBeenCalled();
  expect(calls.clerkSetup).toHaveBeenCalledOnce();
});

it('runs the staging CLI through native Node before obtaining any Clerk testing token', async () => {
  vi.stubEnv('E2E_REQUIRE_CLOUD', 'true');
  await setup();
  expect(calls.execFileSync).toHaveBeenCalledWith(
    process.execPath,
    [expect.stringMatching(/scripts\/staging-preflight\.mjs$/)],
    { stdio: 'inherit' },
  );
  expect(calls.execFileSync.mock.invocationCallOrder[0]).toBeLessThan(calls.clerkSetup.mock.invocationCallOrder[0]);
});

it('stops setup immediately if staging attestation fails', async () => {
  vi.stubEnv('E2E_REQUIRE_CLOUD', 'true');
  calls.execFileSync.mockImplementation(() => { throw new Error('Preflight failed'); });
  await expect(setup()).rejects.toThrow('Preflight failed');
  expect(calls.clerkSetup).not.toHaveBeenCalled();
});
