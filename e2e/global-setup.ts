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
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) {
    await clerkSetup();
  }
}
