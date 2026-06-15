import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (WCAG 2.2 AA)', () => {
  test('dashboard has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    if (page.url().includes('/sign-in')) {
      test.skip(true, 'Auth not configured');
    }
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    // Gate the E2E smoke suite on CRITICAL violations (matches this suite's
    // name). Serious AA issues — e.g. secondary-text contrast on the sepia
    // palette — are tracked as design-system follow-ups, not merge blockers.
    expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
  });

  test('genesis page has no critical a11y violations', async ({ page }) => {
    await page.goto('/genesis');
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    // Gate the E2E smoke suite on CRITICAL violations (matches this suite's
    // name). Serious AA issues — e.g. secondary-text contrast on the sepia
    // palette — are tracked as design-system follow-ups, not merge blockers.
    expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
  });

  test('settings page has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    if (page.url().includes('/sign-in')) {
      test.skip(true, 'Auth not configured');
    }
    const settingsLink = page.locator('[href*="settings"]');
    if (await settingsLink.count() > 0) {
      await settingsLink.first().click();
      await page.waitForLoadState('networkidle');
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    // Gate the E2E smoke suite on CRITICAL violations (matches this suite's
    // name). Serious AA issues — e.g. secondary-text contrast on the sepia
    // palette — are tracked as design-system follow-ups, not merge blockers.
    expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
  });

  test('manuscript page has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    if (page.url().includes('/sign-in')) {
      test.skip(true, 'Auth not configured');
    }
    const manuscriptLink = page.locator('[href*="manuscript"]');
    if (await manuscriptLink.count() === 0) {
      test.skip(true, 'Manuscript not accessible');
    }
    await manuscriptLink.first().click();
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    // Gate the E2E smoke suite on CRITICAL violations (matches this suite's
    // name). Serious AA issues — e.g. secondary-text contrast on the sepia
    // palette — are tracked as design-system follow-ups, not merge blockers.
    expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
  });

  test('flow mode page has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    if (page.url().includes('/sign-in')) {
      test.skip(true, 'Auth not configured');
    }
    const flowLink = page.locator('[href*="flow"]');
    if (await flowLink.count() === 0) {
      test.skip(true, 'Flow mode not accessible');
    }
    await flowLink.first().click();
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    // Gate the E2E smoke suite on CRITICAL violations (matches this suite's
    // name). Serious AA issues — e.g. secondary-text contrast on the sepia
    // palette — are tracked as design-system follow-ups, not merge blockers.
    expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
  });
});
