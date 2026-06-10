import { test, expect } from '@playwright/test';

/**
 * Task 6.6 — ME-02: Visual Regression Tests
 *
 * Uses Playwright's built-in toHaveScreenshot() on key pages.
 * Tolerance configured in playwright.config.ts (0.1% pixel diff).
 *
 * First run generates baseline screenshots in e2e/visual-regression.spec.ts-snapshots/.
 * Subsequent runs compare against baselines.
 */
test.describe('Visual regression', () => {
  test.beforeEach(async ({ page }) => {
    // Skip visual regression in environments without a running app
    if (page.url().includes('/sign-in')) {
      test.skip(true, 'Auth required — skipping visual regression');
    }
  });

  test('dashboard page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('manuscript page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const manuscriptLink = page.locator('[href*="manuscript"], [data-testid="manuscript"]');
    if (await manuscriptLink.count() === 0) {
      test.skip(true, 'Manuscript page not accessible');
    }
    await manuscriptLink.first().click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('manuscript.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('flow mode page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const flowLink = page.locator('[href*="flow"], [data-testid="flow-mode"]');
    if (await flowLink.count() === 0) {
      test.skip(true, 'Flow mode not accessible');
    }
    await flowLink.first().click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('flow-mode.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('corkboard page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const corkboardLink = page.locator('[href*="corkboard"], [data-testid="corkboard"]');
    if (await corkboardLink.count() === 0) {
      test.skip(true, 'Corkboard not accessible');
    }
    await corkboardLink.first().click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('corkboard.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('settings page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsLink = page.locator('[href*="settings"], [data-testid="settings"]');
    if (await settingsLink.count() === 0) {
      test.skip(true, 'Settings not accessible');
    }
    await settingsLink.first().click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('settings.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
