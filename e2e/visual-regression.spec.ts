import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

/**
 * Task 6.6 — ME-02: Visual Regression Tests
 *
 * Uses Playwright's built-in toHaveScreenshot() on key pages.
 * Tolerance configured in playwright.config.ts.
 *
 * Baselines live in e2e/visual-regression.spec.ts-snapshots/ and are
 * platform-specific — CI needs linux-generated baselines, produced by the
 * .github/workflows/visual-baselines.yml workflow (see docs/E2E.md).
 *
 * Navigation: each page is opened DIRECTLY via its URL rather than by clicking
 * sidebar links from '/'. In a fresh CI project the dashboard's GenesisGuard
 * redirects '/' to /genesis, whose full-height onboarding overlay intercepted
 * the old sidebar-click navigation (causing click-timeout failures). Direct
 * navigation renders each page deterministically from empty story data.
 *
 * Flake hardening: every screenshot disables animations and hides the caret;
 * navigation waits for networkidle. Captures render from stored story data, not
 * wall-clock time.
 */

const SCREENSHOT_OPTIONS = {
  fullPage: true,
  animations: 'disabled',
  caret: 'hide',
} as const;

test.describe('Visual regression', () => {
  test('genesis (first-run) page', async ({ page }) => {
    // The empty-project onboarding screen — what a brand-new user actually sees
    // (GenesisGuard redirects an empty dashboard here).
    await gotoApp(page, '/genesis');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('genesis.png', SCREENSHOT_OPTIONS);
  });

  test('manuscript page', async ({ page }) => {
    await gotoApp(page, '/manuscript');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('manuscript.png', SCREENSHOT_OPTIONS);
  });

  test('flow mode page', async ({ page }) => {
    await gotoApp(page, '/flow');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('flow-mode.png', SCREENSHOT_OPTIONS);
  });

  test('settings page', async ({ page }) => {
    await gotoApp(page, '/settings');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('settings.png', SCREENSHOT_OPTIONS);
  });
});
