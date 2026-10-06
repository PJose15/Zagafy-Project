import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { gotoApp } from './helpers/auth';

test('JSON backup restores a changed chapter and survives reload', async ({ page }, testInfo) => {
  const title = `Backup check ${Date.now()}`;
  const text = 'The ledger held the last copy of the lighthouse keeper’s letter.';
  await gotoApp(page, '/manuscript');
  await page.getByRole('button', { name: 'New Chapter', exact: true }).click();
  await page.getByPlaceholder('Chapter Title', { exact: true }).fill(title);
  await page.locator('[contenteditable="true"]').first().fill(text);
  await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const backupPath = testInfo.outputPath('project-backup.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  expect(backup.chapters.some((c: { title: string }) => c.title === title)).toBe(true);
  // Exercise nonempty genre and author metadata when restoring the backup.
  backup.genre = ['Mystery', 'Fantasy'];
  backup.author_name = 'Release Test';
  backup.author_email = 'writer@example.test';
  backup.author_address = 'Ponce, Puerto Rico';
  await writeFile(backupPath, JSON.stringify(backup));

  await page.goto('/manuscript');
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  await page.getByPlaceholder('Chapter Title', { exact: true }).fill(`${title} changed`);
  await page.locator('[contenteditable="true"]').first().fill('This replacement must disappear after restore.');
  await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
  await expect(page.getByText(`${title} changed`, { exact: true })).toBeVisible();

  await page.goto('/settings');
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(backupPath);
  await page.getByRole('button', { name: 'Replace Data', exact: true }).click();
  await expect(page.getByText('Project data imported successfully.', { exact: true })).toBeVisible();
  await page.goto('/manuscript');
  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(`${title} changed`, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  await expect(page.locator('[contenteditable="true"]').first()).toContainText(text);

  await page.goto('/settings');
  const restoredDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const restoredDownload = await restoredDownloadPromise;
  const restoredPath = testInfo.outputPath('restored-backup.json');
  await restoredDownload.saveAs(restoredPath);
  const restored = JSON.parse(await readFile(restoredPath, 'utf8'));
  expect(restored.genre).toEqual(backup.genre);
  expect(restored.author_name).toBe(backup.author_name);
  expect(restored.author_email).toBe(backup.author_email);
  expect(restored.author_address).toBe(backup.author_address);
});
