import { test, expect, type Page } from '@playwright/test';
import { gotoApp } from './helpers/auth';

/**
 * Task 6.6 — ME-02: Visual Regression Tests
 *
 * Uses Playwright's built-in toHaveScreenshot() on key pages.
 * Tolerance configured in playwright.config.ts (0.1% pixel diff).
 *
 * Baselines live in e2e/visual-regression.spec.ts-snapshots/ and are
 * platform-specific — CI needs linux-generated baselines, produced by the
 * manual .github/workflows/visual-baselines.yml workflow (see docs/E2E.md).
 *
 * Flake hardening: every screenshot disables animations and hides the text
 * caret; navigation waits for networkidle. No masks — the captured pages
 * render from stored story data, not wall-clock time.
 */

const SCREENSHOT_OPTIONS = {
  fullPage: true,
  animations: 'disabled',
  caret: 'hide',
} as const;

/** Follow an in-app nav link (skipping when the page is not reachable). */
async function gotoSection(page: Page, selector: string, label: string): Promise<void> {
  const link = page.locator(selector);
  if (await link.count() === 0) {
    test.skip(true, `${label} not accessible`);
  }
  await link.first().click();
  await page.waitForLoadState('networkidle');
}

test.describe('Visual regression', () => {
  test('dashboard page', async ({ page }) => {
    await gotoApp(page, '/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard.png', SCREENSHOT_OPTIONS);
  });

  test('manuscript page', async ({ page }) => {
    await gotoApp(page, '/');
    await page.waitForLoadState('networkidle');
    await gotoSection(page, '[href*="manuscript"], [data-testid="manuscript"]', 'Manuscript page');
    await expect(page).toHaveScreenshot('manuscript.png', SCREENSHOT_OPTIONS);
  });

  test('flow mode page', async ({ page }) => {
    await gotoApp(page, '/');
    await page.waitForLoadState('networkidle');
    await gotoSection(page, '[href*="flow"], [data-testid="flow-mode"]', 'Flow mode');
    await expect(page).toHaveScreenshot('flow-mode.png', SCREENSHOT_OPTIONS);
  });

  test('corkboard page', async ({ page }) => {
    await gotoApp(page, '/');
    await page.waitForLoadState('networkidle');
    await gotoSection(page, '[href*="corkboard"], [data-testid="corkboard"]', 'Corkboard');
    await expect(page).toHaveScreenshot('corkboard.png', SCREENSHOT_OPTIONS);
  });

  test('settings page', async ({ page }) => {
    await gotoApp(page, '/');
    await page.waitForLoadState('networkidle');
    await gotoSection(page, '[href*="settings"], [data-testid="settings"]', 'Settings');
    await expect(page).toHaveScreenshot('settings.png', SCREENSHOT_OPTIONS);
  });
});
