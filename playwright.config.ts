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
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
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
