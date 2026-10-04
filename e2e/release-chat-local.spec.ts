import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

/** A failed model call leaves a single durable user message, not a welcome
 * bubble plus a message. Copy/clear must stay enabled and restoration must work. */
test('a single saved chat message can be cleared and restored without a model replay', async ({ page }) => {
  await gotoApp(page, '/assistant');
  let requests = 0;
  await page.route('**/api/chat', async route => {
    requests++;
    await route.fulfill({ status: 503, json: { error: 'Test provider unavailable' } });
  });
  const text = `Single durable turn ${Date.now()}`;
  await page.locator('textarea').fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Test provider unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear chat history', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Clear chat history', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  await page.goto('/versions');
  const name = 'Chat clear recovery (local only)';
  await page.getByText(name, { exact: true }).locator('../..').getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText(`Restored "${name}".`, { exact: true })).toBeVisible();
  await page.goto('/assistant');
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText(text, { exact: true })).toBeVisible();
  expect(requests).toBe(1);
});
