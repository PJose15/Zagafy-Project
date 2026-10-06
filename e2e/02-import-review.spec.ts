import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

// Deterministic ingestion response exercises review and real browser persistence.
// Real model quality is a separate authenticated staging gate.
test('accepted imported prose survives navigation and reload', async ({ page }) => {
  const title = `Imported ledger ${Date.now()}`;
  const prose = 'The lighthouse keeper discovered a letter addressed to tomorrow.';
  let ingested = false;
  await page.route('**/api/ingest', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postData()).toContain('chapter.txt');
    ingested = true;
    await route.fulfill({ json: { extractedData: { chapters: [{ title, summary: 'A strange letter', raw_text_reference: prose }] } } });
  });
  await gotoApp(page, '/import');
  await page.locator('input[type=file]').setInputFiles({ name: 'chapter.txt', mimeType: 'text/plain', buffer: Buffer.from(prose) });
  await page.getByRole('button', { name: 'Start Ingestion', exact: true }).click();
  await page.getByRole('button', { name: 'Accept All', exact: true }).click();
  await page.getByRole('button', { name: 'Import 1 Accepted', exact: true }).click();
  await expect(page.getByText('Ingestion Complete', { exact: true })).toBeVisible();
  expect(ingested).toBe(true);
  await page.goto('/manuscript');
  await page.reload();
  await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
  await expect(page.locator('[contenteditable=true]').first()).toContainText(prose);
});
