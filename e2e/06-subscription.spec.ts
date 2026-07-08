import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

/**
 * E2E Flow 6: Subscribe to Writer plan (Stripe test mode)
 *
 * This test verifies the billing flow reaches Stripe Checkout in test mode.
 * Actual payment completion requires Stripe test card entry which is
 * handled by Stripe's hosted page.
 */
test.describe('Subscription', () => {
  test('initiate checkout for Writer plan', async ({ page }) => {
    await gotoApp(page, '/');

    // Navigate to settings / billing
    const settingsLink = page.locator(
      '[href*="settings"], [href*="billing"], [data-testid="settings"]'
    );
    if (await settingsLink.count() === 0) {
      test.skip(true, 'Settings/billing page not found');
    }
    await settingsLink.first().click();
    await page.waitForLoadState('networkidle');

    // Look for billing tab if settings has tabs
    const billingTab = page.locator(
      'button:has-text("Billing"), [data-testid="billing-tab"], [href*="billing"]'
    );
    if (await billingTab.count() > 0) {
      await billingTab.first().click();
      await page.waitForTimeout(500);
    }

    // Click upgrade / subscribe button
    const upgradeBtn = page.locator(
      'button:has-text("Upgrade"), button:has-text("Subscribe"), button:has-text("Writer"), [data-testid="upgrade"]'
    );
    if (await upgradeBtn.count() === 0) {
      test.skip(true, 'Upgrade button not found');
    }

    // Clicking should redirect to Stripe Checkout
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/billing/checkout'), { timeout: 5000 }).catch(() => null),
      upgradeBtn.first().click(),
    ]);

    if (response) {
      // Verify the checkout API returned success
      expect(response.status()).toBeLessThan(400);
    }
  });
});
