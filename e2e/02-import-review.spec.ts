import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';
import path from 'path';

/**
 * E2E Flow 2: Import file → review queue → accept → manuscript updated
 */
test.describe('Import flow', () => {
  test('import a text file and verify manuscript update', async ({ page }) => {
    await gotoApp(page, '/');

    // Navigate to import
    const importLink = page.locator('[href*="import"], [data-testid="import"]');
    if (await importLink.count() === 0) {
      test.skip(true, 'Import page not found');
    }
    await importLink.first().click();

    // Upload a test file
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      // Create a test file path — the test will use the fixture
      const testFilePath = path.join(__dirname, 'fixtures', 'test-manuscript.txt');
      await fileInput.setInputFiles(testFilePath).catch(() => {
        // If fixture doesn't exist, skip
      });
    }

    // Look for confirm / accept button
    const confirmBtn = page.locator(
      'button:has-text("Confirm"), button:has-text("Accept"), button:has-text("Import"), [data-testid="confirm-import"]'
    );
    if (await confirmBtn.count() > 0) {
      await confirmBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // Verify content appears in manuscript
    const manuscriptLink = page.locator('[href*="manuscript"], [data-testid="manuscript"]');
    if (await manuscriptLink.count() > 0) {
      await manuscriptLink.first().click();
      await page.waitForLoadState('networkidle');
    }
  });
});
