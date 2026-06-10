import { expect, test } from '@playwright/test';

/**
 * Stage-3: the modern Bifurcation tab. Sweeping g must build the diagram in
 * cancellable chunks and render it to #bifCanvas.
 */
test('modern Bifurcation tab sweeps g and renders the diagram', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __modernTabs?: unknown }).__modernTabs));
  await page.evaluate(() => (document.querySelector('[role="tab"][data-tab="bifurc"]') as HTMLButtonElement | null)?.click());
  await expect(page.locator('#tab-bifurc')).toBeVisible();

  // Small/fast sweep for the test.
  await page.evaluate(() => {
    (document.getElementById('bifSteps') as HTMLInputElement).value = '40';
    (document.getElementById('bifT') as HTMLInputElement).value = '20';
  });
  await page.evaluate(() => document.getElementById('bifStart')?.click());
  await page.waitForFunction(() => (document.getElementById('bifStatus')?.textContent ?? '').includes('done'), undefined, { timeout: 30000 });

  // The bifurcation canvas is non-blank.
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('bifCanvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 297) s += d[i]!;
    return s;
  });
  expect(drawn).toBeGreaterThan(0);
});
