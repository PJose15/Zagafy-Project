import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { clerkSetup } from '@clerk/testing/playwright';

/**
 * S6-M3 — Playwright global setup.
 *
 * When Clerk E2E credentials are configured, obtain a Clerk Testing Token so
 * sign-in flows bypass bot protection. With no credentials (keyless local runs
 * and CI before the secrets are added), this is a no-op and the suite behaves
 * exactly as before: the app boots with auth disabled and specs run against
 * the unauthenticated app.
 */
export default async function globalSetup(): Promise<void> {
  // Execute the .mjs CLI natively: Playwright loads this TS setup as CommonJS.
  if (process.env.E2E_REQUIRE_CLOUD === 'true') execFileSync(process.execPath, [resolve('scripts/staging-preflight.mjs')], { stdio: 'inherit' });
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) {
    await clerkSetup();
  }
}
