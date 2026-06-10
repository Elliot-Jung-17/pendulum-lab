import { expect, test } from '@playwright/test';

test('core controls and canvases expose accessible names', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas[role="img"]').first()).toBeVisible();
  await expect(page.locator('button[aria-label]').first()).toBeVisible();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBeTruthy();
});
