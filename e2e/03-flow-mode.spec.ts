import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

// Required controls and real IndexedDB persistence; model quality is tested on staging.
test('Flow prose autosaves and survives returning to Manuscript and reload', async ({ page }) => {
  const title = `Flow ledger ${Date.now()}`;
  const prose = 'The protagonist entered the abandoned library and discovered a letter among the dusty ledgers.';
  await gotoApp(page, '/manuscript');
  await page.getByRole('button', { name: 'New Chapter', exact: true }).click();
  await page.getByPlaceholder('Chapter Title', { exact: true }).fill(title);
  await page.locator('[contenteditable=true]').first().fill('An old beginning.');
  await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.goto('/flow');
  await page.getByRole('button').filter({ hasText: title }).click();
  await page.getByPlaceholder('Start writing... no backspace, no delete, just forward.', { exact: true }).fill(prose);
  await expect.poll(() => page.evaluate(async ({ title, prose }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('zagafy');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const rows = await new Promise<Array<{ title: string; content: string }>>((resolve, reject) => {
        const request = database.transaction('chapters', 'readonly').objectStore('chapters').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return rows.some(row => row.title === title && row.content.includes(prose));
    } finally { database.close(); }
  }, { title, prose }), { message: 'Flow autosave must reach durable chapter storage', timeout: 15_000 }).toBe(true);
  await page.goto('/manuscript');
  await page.reload();
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  await expect(page.locator('[contenteditable=true]').first()).toContainText(prose);
});
