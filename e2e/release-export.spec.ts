import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { gotoApp } from './helpers/auth';

/** Real browser download + independent document parsing; no mocked export API. */
for (const format of ['docx', 'pdf'] as const) {
  test(`saved chapter exports as readable ${format.toUpperCase()}`, async ({ page }, testInfo) => {
    const title = `Export check ${Date.now()}`;
    const text = 'The lighthouse keeper found a letter addressed to tomorrow.\nLa carta decía: mañana volverá la luz.';
    await gotoApp(page, '/manuscript');
    await page.getByRole('button', { name: 'New Chapter', exact: true }).click();
    await page.getByPlaceholder('Chapter Title', { exact: true }).fill(title);
    await page.locator('[contenteditable="true"]').first().fill(text);
    await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.goto('/publishing');
    await page.getByRole('button', { name: 'Export manuscript (.docx / .pdf)', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export manuscript' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: format === 'docx' ? 'Word (.docx)' : 'PDF (.pdf)', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: `Export ${format.toUpperCase()}`, exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(format === 'docx' ? /\.docx$/ : /\.pdf$/);
    expect(await download.failure()).toBeNull();
    await download.saveAs(testInfo.outputPath(`manuscript.${format}`));
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const buffer = await readFile(downloadedPath!);
    let extracted: string;
    if (format === 'docx') {
      extracted = (await mammoth.extractRawText({ buffer })).value;
    } else {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try { extracted = (await parser.getText()).text; }
      finally { await parser.destroy(); }
    }
    expect(extracted).toContain(title);
    expect(extracted).toContain('letter addressed to tomorrow');
    expect(extracted).toContain('mañana volverá la luz');
  });
}
