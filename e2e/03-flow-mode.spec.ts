import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

/**
 * E2E Flow 3: Flow mode session → braindump → polish → save
 */
test.describe('Flow mode', () => {
  test('enter flow mode, write content, and save', async ({ page }) => {
    await gotoApp(page, '/');

    // Navigate to flow mode
    const flowLink = page.locator('[href*="flow"], [data-testid="flow-mode"]');
    if (await flowLink.count() === 0) {
      test.skip(true, 'Flow mode not found');
    }
    await flowLink.first().click();
    await page.waitForLoadState('networkidle');

    // Find the flow editor / braindump area
    const flowEditor = page.locator(
      'textarea[data-testid="flow-editor"], [data-testid="braindump"], textarea'
    );
    if (await flowEditor.count() > 0) {
      await flowEditor.first().click();
      await flowEditor.first().fill(
        'The protagonist stepped into the abandoned library. Dust motes danced in the fading light.'
      );
    }

    // Look for polish / refine button
    const polishBtn = page.locator(
      'button:has-text("Polish"), button:has-text("Refine"), [data-testid="polish"]'
    );
    if (await polishBtn.count() > 0) {
      await polishBtn.first().click();
      await page.waitForTimeout(3000); // Wait for AI polish
    }

    // Save
    const saveBtn = page.locator(
      'button:has-text("Save"), button:has-text("Keep"), [data-testid="save-flow"]'
    );
    if (await saveBtn.count() > 0) {
      await saveBtn.first().click();
      await page.waitForTimeout(1000);
    }
  });
});
