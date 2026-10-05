import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

// This verifies project setup, not account registration. Auth is independently
// required by the authenticated staging workflow.
test('complete all Genesis steps and persist the project and first chapter', async ({ page }) => {
  await gotoApp(page, '/genesis');
  const title = `Genesis acceptance ${Date.now()}`;
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(next).toBeDisabled();
  await page.getByTestId('genesis-name-input').fill(title);
  await next.click();
  await page.getByTestId('genesis-logline-input').fill('A keeper discovers a letter from tomorrow.');
  await next.click();
  await page.getByRole('button', { name: 'Fantasy', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await next.click();
  await page.getByTestId('genesis-protag-name').fill('Mara Keeper');
  await next.click();
  await page.getByTestId('genesis-antag-name').fill('The Archivist');
  await next.click();
  await page.getByTestId('genesis-world-setting').fill('An island lighthouse beyond the charted sea.');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  // Isolate manuscript persistence from the optional guided-tour overlay.
  await page.evaluate(() => localStorage.setItem('zagafy_tour_completed', 'true'));
  await page.goto('/characters');
  await expect(page.getByText('Mara Keeper', { exact: true })).toBeVisible();
  await expect(page.getByText('The Archivist', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Mara Keeper', { exact: true })).toBeVisible();
  await page.goto('/manuscript');
  await page.getByRole('button', { name: 'New Chapter', exact: true }).click();
  await page.getByPlaceholder('Chapter Title', { exact: true }).fill('The first letter');
  await page.locator('[contenteditable="true"]').first().fill('Mara opened a letter addressed to tomorrow.');
  await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
  await expect(page.getByText('The first letter', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit The first letter', exact: true }).click();
  await expect(page.locator('[contenteditable="true"]').first()).toContainText('addressed to tomorrow');
});
