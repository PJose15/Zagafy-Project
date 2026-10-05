import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';
import AxeBuilder from '@axe-core/playwright';

// This remains a critical-violation smoke gate, not a WCAG compliance claim.
// Full findings are retained even on green CI for the contrast/AA follow-up.
test.describe('Accessibility smoke with complete WCAG findings', () => {
  test('populated dashboard has no critical a11y violations', async ({ page }, testInfo) => {
    await gotoApp(page, '/manuscript');
    await page.getByRole('button', { name: 'New Chapter', exact: true }).click();
    await page.getByPlaceholder('Chapter Title', { exact: true }).fill('Accessibility fixture');
    await page.locator('[contenteditable="true"]').first().fill('The lighthouse lights the sea.');
    await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
    await expect(page.getByText('Accessibility fixture', { exact: true })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    await testInfo.attach('dashboard-accessibility.json', {
      body: JSON.stringify({ route: '/', violations: results.violations, incomplete: results.incomplete }, null, 2),
      contentType: 'application/json',
    });
    expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
  });
  for (const [name, path] of [['genesis', '/genesis'], ['settings', '/settings'],
    ['manuscript', '/manuscript'], ['flow', '/flow']] as const) {
    test(`${name} has no critical a11y violations`, async ({ page }, testInfo) => {
      await gotoApp(page, path);
      await expect.poll(() => new URL(page.url()).pathname).toBe(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      await testInfo.attach(`${name}-accessibility.json`, {
        body: JSON.stringify({ route: path, violations: results.violations, incomplete: results.incomplete }, null, 2),
        contentType: 'application/json',
      });
      expect(results.violations.filter(v => v.impact === 'critical')).toEqual([]);
    });
  }
});
