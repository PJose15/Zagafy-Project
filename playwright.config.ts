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
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
  // Task 6.6 — Visual regression tolerance
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001, // 0.1% pixel diff tolerance
    },
  },
});
