import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers/auth';

for (const width of [390, 768]) {
  test(`Spanish interface preserves writing and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await gotoApp(page, '/settings');
    await page.getByLabel('App language', { exact: true }).selectOption('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.reload();
    await expect(page.getByLabel('Idioma de la aplicación', { exact: true })).toHaveValue('es');
    if (width < 768) await page.locator('button[aria-controls="project-navigation"]').click();
    const navigation = page.getByRole('navigation', { name: 'Navegación principal', exact: true });
    await navigation.getByRole('link', { name: 'Manuscrito', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo Capítulo', exact: true }).click();
    const title = 'La última carta del faro y el secreto de la biblioteca olvidada';
    const text = 'Mara encontró una carta: «Mañana volveré». El océano guardó su secreto.';
    await page.getByPlaceholder('Título del Capítulo', { exact: true }).fill(title);
    await page.locator('[contenteditable="true"]').first().fill(text);
    await page.getByRole('button', { name: 'Guardar Capítulo', exact: true }).click();
    await expect(page.getByRole('button', { name: `Editar ${title}`, exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: `Editar ${title}`, exact: true }).click();
    await expect(page.locator('[contenteditable="true"]').first()).toHaveText(text);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
    await page.goto('/settings');
    await page.getByLabel('Idioma de la aplicación', { exact: true }).selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('/manuscript');
    await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
    await expect(page.locator('[contenteditable="true"]').first()).toHaveText(text);
  });
}
