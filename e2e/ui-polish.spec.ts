import { expect, test } from '@playwright/test';

/**
 * The header panel toggle collapses every tab's right control panel, persists
 * across reloads, and is reversible from the "\" keyboard shortcut.
 */
test('side-panel toggle collapses, persists, and restores', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));

  const labControls = page.locator('#tab-lab .controls');
  await expect(labControls).toBeVisible();

  await page.locator('#panelToggle').click();
  await expect(labControls).toBeHidden();

  // The class lives on <body>, so it applies on other tabs too.
  await page.locator('.rail-menu-button[data-rail-section-button="sim"]').click();
  await page.locator('.tab[data-tab="compare"]').first().click();
  await expect(page.locator('#tab-compare .controls')).toBeHidden();

  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await expect(page.locator('#tab-lab .controls')).toBeHidden();

  await page.keyboard.press('\\');
  await expect(page.locator('#tab-lab .controls')).toBeVisible();
});
