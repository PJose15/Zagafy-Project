import { test, expect, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

/**
 * S6-M3 — shared auth entry point for the E2E suite.
 *
 * Three modes, resolved at runtime:
 * 1. Auth disabled (no Clerk keys — keyless local runs / CI without secrets):
 *    the app never redirects to /sign-in, so we just navigate. Same behavior
 *    as before this helper existed.
 * 2. Auth enabled + E2E credentials configured: install the Clerk testing
 *    token (bypasses bot protection), sign in with the dedicated test user via
 *    the Clerk <SignIn /> form, and land on the requested page. This is what
 *    finally exercises the authenticated flows in CI (see docs/E2E.md for the
 *    four secrets to configure).
 * 3. Auth enabled but credentials missing: skip with an actionable message —
 *    the pre-existing behavior, now with instructions.
 */

const E2E_EMAIL = process.env.E2E_CLERK_USER_EMAIL;
const E2E_PASSWORD = process.env.E2E_CLERK_USER_PASSWORD;

export function clerkE2ECredentialsConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY &&
    E2E_EMAIL &&
    E2E_PASSWORD,
  );
}

/**
 * Navigate to `path`, signing in through Clerk first when the app requires it.
 * Skips the current test (with setup instructions) when auth is enabled but
 * the E2E credentials are not configured.
 */
export async function gotoApp(page: Page, path: string = '/'): Promise<void> {
  const useClerk = clerkE2ECredentialsConfigured();

  // The testing token must be installed before navigation so Clerk FAPI
  // requests carry it from the first load.
  if (useClerk) {
    await setupClerkTestingToken({ page });
  }

  await page.goto(path);

  if (!page.url().includes('/sign-in')) return; // auth disabled or already signed in

  if (!useClerk) {
    test.skip(
      true,
      'Auth enabled but Clerk E2E credentials not configured — set the ' +
        'E2E_CLERK_PUBLISHABLE_KEY / E2E_CLERK_SECRET_KEY / E2E_CLERK_USER_EMAIL / ' +
        'E2E_CLERK_USER_PASSWORD repo secrets (see docs/E2E.md)',
    );
    return;
  }

  // Clerk <SignIn /> flow: identifier first, then password.
  const identifier = page.locator('input[name="identifier"]');
  await identifier.waitFor({ state: 'visible', timeout: 15_000 });
  await identifier.fill(E2E_EMAIL!);
  await page.getByRole('button', { name: /continue/i }).click();

  const password = page.locator('input[name="password"]');
  await password.waitFor({ state: 'visible', timeout: 15_000 });
  await password.fill(E2E_PASSWORD!);
  await page.getByRole('button', { name: /continue|sign in/i }).first().click();

  // Signed in — Clerk redirects back into the app.
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 20_000 });

  // If the requested path was lost in the redirect dance, navigate again.
  if (path !== '/' && !page.url().includes(path)) {
    await page.goto(path);
  }
  await expect(page).not.toHaveURL(/sign-in/);
}
