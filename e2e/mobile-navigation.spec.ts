import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('project navigation traps focus, restores it on Escape and supports project menus', async ({ page }) => {
    await gotoApp(page, '/manuscript');
    const opener = page.locator('button[aria-controls="project-navigation"]');
    await opener.focus();
    await opener.press('Enter');
    const drawer = page.getByRole('dialog', { name: 'Zagafy', exact: true });
    const close = drawer.getByRole('button', { name: 'Close navigation', exact: true });
    await expect(close).toBeFocused();
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await close.press('Shift+Tab');
    await expect(drawer.getByRole('link', { name: 'Settings', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await drawer.getByRole('button', { name: /Active project:/ }).click();
    await expect(drawer.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer.getByRole('menu')).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('navigation follows links and releases its modal state on desktop resize', async ({ page }) => {
    await gotoApp(page, '/manuscript');
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
  });
});
