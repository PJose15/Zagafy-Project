import { defineConfig, devices } from '@playwright/test';

/**
 * Task 6.5 — Playwright E2E configuration.
 *
 * Critical flows: sign-up, genesis, manuscript, import, flow mode,
 * find-and-replace, export, subscription, collaboration.
 *
 * Runs against a local dev server by default; CI overrides BASE_URL
 * for staging.
 */
export default defineConfig({
  testDir: './e2e',
  // S6-M3: mints a Clerk Testing Token when E2E auth credentials are
  // configured; a no-op otherwise. See e2e/global-setup.ts and docs/E2E.md.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The dev server compiles routes on first hit, so first navigations can be
  // slow. Give navigation/actions headroom over the default 30s.
  timeout: 90_000,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    // Settle animations so elements become "stable" for clicks/visibility.
    contextOptions: { reducedMotion: 'reduce' },
    // Pre-clear the first-run intake gates (diagnostic + ritual overlays) so
    // tests reach the app. The SessionProvider honors this flag; real users
    // never set it.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: process.env.BASE_URL || 'http://localhost:3000',
          localStorage: [
            { name: 'zagafy_skip_intake', value: 'true' },
            // Suppress the onboarding tour (its third-party nav dots trip
            // WCAG 2.2 target-size and overlay the page).
            { name: 'zagafy_tour_completed', value: 'true' },
          ],
        },
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the app for E2E in every environment. In CI (no external staging
  // URL is wired) Playwright boots a fresh dev server; locally it reuses one
  // if already running. Without this, CI tests hit a dead localhost:3000.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  // Task 6.6 — Visual regression tolerance
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001, // 0.1% pixel diff tolerance
    },
  },
});
