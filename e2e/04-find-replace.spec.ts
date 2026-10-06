import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

test('cancel leaves chapters unchanged; confirmed replacement persists across chapters', async ({ page }) => {
  await gotoApp(page, '/manuscript');
  for (const [title, content] of [['Harbor', 'The dark harbor held a dark secret.'], ['Letter', 'A dark letter arrived.']]) {
    await page.getByRole('button', { name: 'New Chapter', exact: true }).click();
    await page.getByPlaceholder('Chapter Title', { exact: true }).fill(title);
    await page.locator('[contenteditable="true"]').first().fill(content);
    await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
    await expect(page.getByRole('button', { name: `Edit ${title}`, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Find & replace', exact: true });
  await dialog.getByLabel('Find query', { exact: true }).fill('dark');
  await dialog.getByLabel('Replacement text', { exact: true }).fill('bright');
  await expect(dialog.getByText('3 matches · 2 chapters', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace all', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Confirm replace', exact: true });
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByText('3 matches · 2 chapters', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Replace all', exact: true }).click();
  await confirm.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Replacements saved.');
  // Reload as soon as the acknowledged write completes, without debounce sleeps.
  await page.reload();
  for (const [title, content] of [['Harbor', 'The bright harbor held a bright secret.'], ['Letter', 'A bright letter arrived.']]) {
    await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
    await expect(page.locator('[contenteditable="true"]').first()).toHaveText(content);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
});
