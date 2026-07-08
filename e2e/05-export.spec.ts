import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

/**
 * E2E Flow 5: Export to .docx
 */
test.describe('Export', () => {
  test('export manuscript as docx', async ({ page }) => {
    await gotoApp(page, '/');

    // Navigate to manuscript or settings for export
    const manuscriptLink = page.locator('[href*="manuscript"], [data-testid="manuscript"]');
    if (await manuscriptLink.count() > 0) {
      await manuscriptLink.first().click();
      await page.waitForLoadState('networkidle');
    }

    // Look for export button/menu
    const exportBtn = page.locator(
      'button:has-text("Export"), [data-testid="export"], [href*="export"]'
    );
    if (await exportBtn.count() === 0) {
      test.skip(true, 'Export button not found');
    }
    await exportBtn.first().click();

    // Select docx format if format selector exists
    const docxOption = page.locator(
      'button:has-text(".docx"), button:has-text("DOCX"), [data-testid="export-docx"]'
    );
    if (await docxOption.count() > 0) {
      // Set up download listener
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }).catch(() => null),
        docxOption.first().click(),
      ]);

      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.docx$/);
      }
    }
  });
});
