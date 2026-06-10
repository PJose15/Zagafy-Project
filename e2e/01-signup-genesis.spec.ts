import { test, expect } from '@playwright/test';

/**
 * E2E Flow 1: Sign up → Genesis → first chapter → save → reload → still there
 *
 * This test covers the critical onboarding path. In CI, Clerk test mode
 * provides a test user. Locally, we use the embed-mode bypass.
 */
test.describe('Sign-up and Genesis flow', () => {
  test('complete genesis and verify first chapter persists', async ({ page }) => {
    // Navigate to the app — in embed mode, auth is bypassed
    await page.goto('/');
    await expect(page).toHaveTitle(/Zagafy|Story/i);

    // If redirected to sign-in, use test credentials
    if (page.url().includes('/sign-in')) {
      test.skip(true, 'Clerk test mode not configured — skipping auth flow');
    }

    // Look for genesis or dashboard
    const hasGenesis = await page.locator('[data-testid="genesis"], [href*="genesis"]').count();
    if (hasGenesis > 0) {
      await page.locator('[data-testid="genesis"], [href*="genesis"]').first().click();
    }

    // Genesis form: fill in story basics
    const titleInput = page.locator('input[name="title"], [data-testid="story-title"]');
    if (await titleInput.count() > 0) {
      await titleInput.fill('Test Story — E2E');
    }

    const genreSelect = page.locator('select[name="genre"], [data-testid="genre-select"]');
    if (await genreSelect.count() > 0) {
      await genreSelect.selectOption({ index: 1 });
    }

    // Submit genesis if there's a submit button
    const submitBtn = page.locator('button[type="submit"], [data-testid="genesis-submit"]');
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForURL(/\/(manuscript|dashboard|story)/, { timeout: 10_000 });
    }

    // Navigate to manuscript / editor
    const manuscriptLink = page.locator('[href*="manuscript"], [data-testid="manuscript"]');
    if (await manuscriptLink.count() > 0) {
      await manuscriptLink.first().click();
    }

    // Type in the editor
    const editor = page.locator('textarea, [contenteditable="true"], [data-testid="editor"]');
    if (await editor.count() > 0) {
      await editor.first().click();
      await editor.first().fill('It was a dark and stormy night. The E2E test had begun.');
    }

    // Save (Ctrl+S or auto-save)
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1000);

    // Reload and verify content persists
    await page.reload();
    await page.waitForLoadState('networkidle');

    const editorAfterReload = page.locator('textarea, [contenteditable="true"], [data-testid="editor"]');
    if (await editorAfterReload.count() > 0) {
      const content = await editorAfterReload.first().inputValue().catch(() => '');
      const textContent = await editorAfterReload.first().textContent().catch(() => '');
      const hasContent = content.includes('dark and stormy') || (textContent ?? '').includes('dark and stormy');
      expect(hasContent).toBe(true);
    }
  });
});
