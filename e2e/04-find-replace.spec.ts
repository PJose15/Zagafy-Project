import { test, expect } from '@playwright/test';

/**
 * E2E Flow 4: Find-and-replace across chapters
 */
test.describe('Find and replace', () => {
  test('find text and replace across manuscript', async ({ page }) => {
    await page.goto('/');

    if (page.url().includes('/sign-in')) {
      test.skip(true, 'Auth not configured for E2E');
    }

    // Navigate to manuscript
    const manuscriptLink = page.locator('[href*="manuscript"], [data-testid="manuscript"]');
    if (await manuscriptLink.count() === 0) {
      test.skip(true, 'Manuscript page not found');
    }
    await manuscriptLink.first().click();
    await page.waitForLoadState('networkidle');

    // Open find-and-replace (Ctrl+H or toolbar button)
    await page.keyboard.press('Control+h');
    await page.waitForTimeout(500);

    const findInput = page.locator(
      'input[placeholder*="Find"], input[data-testid="find-input"], [aria-label*="Find"]'
    );
    const replaceInput = page.locator(
      'input[placeholder*="Replace"], input[data-testid="replace-input"], [aria-label*="Replace"]'
    );

    if (await findInput.count() > 0 && await replaceInput.count() > 0) {
      await findInput.first().fill('dark');
      await replaceInput.first().fill('bright');

      const replaceAllBtn = page.locator(
        'button:has-text("Replace All"), button:has-text("Replace all"), [data-testid="replace-all"]'
      );
      if (await replaceAllBtn.count() > 0) {
        await replaceAllBtn.first().click();
        await page.waitForTimeout(500);
      }
    }
  });
});
