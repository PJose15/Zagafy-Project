import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

/** Required core journey: no optional selectors and no test.skip branches. */
test('a chapter survives save, navigation and reload', async ({ page }) => {
  await gotoApp(page, '/manuscript');
  await page.getByRole('button', { name: 'New Chapter', exact: true }).click();
  const title = `Release check ${Date.now()}`;
  await page.getByPlaceholder('Chapter Title', { exact: true }).fill(title);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  await editor.fill('The lighthouse keeper opened the ledger and found a letter addressed to tomorrow.');
  await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  await expect(page.locator('[contenteditable="true"]').first()).toContainText('addressed to tomorrow');
});
