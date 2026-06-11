import { expect, test } from '@playwright/test';

test('app opens with no console errors and the workbench renders without horizontal overflow', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernShell?: unknown }).__modernShell));
  await page.waitForTimeout(1200);

  // Open the Research Workbench and the 3D Lab — the two new heavy surfaces.
  await page.locator('.rail-menu-button[data-rail-section-button="govern"]').click();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await expect(page.locator('#researchWorkbench')).toBeVisible();
  await page.locator('#rail-panel-govern .tab[data-tab="lab3d"]').click();
  await expect(page.locator('#lab3dRopeCard')).toBeVisible();
  await page.locator('#rail-panel-govern .tab[data-tab="research"]').click();
  await page.waitForTimeout(400);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  // The Research Workbench introduces no horizontal page overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
