import { expect, test } from '@playwright/test';

/**
 * Stage-2 parity test for the modern Lab simulation/render loop. With the
 * `?modernLabProbe` feature flag, `src/app` mounts a self-contained modern Lab
 * onto a dedicated probe canvas (the legacy `#main` canvas is untouched). This
 * verifies the new loop runs end-to-end in a real browser: it animates, it
 * advances simulation time, and it conserves energy as the typed engine does.
 */

type ProbeSnapshot = { time: number; drift: number; energy: number; state: number[] };

function canvasChecksum(): number {
  const canvas = document.getElementById('modern-lab-probe') as HTMLCanvasElement | null;
  if (!canvas) return -1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return -1;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 257) sum = (sum + data[i]!) % 2147483647;
  return sum;
}

function readSnapshot(): ProbeSnapshot | null {
  const handle = (window as unknown as { __modernLabProbe?: { lastSnapshot(): ProbeSnapshot } }).__modernLabProbe;
  return handle ? handle.lastSnapshot() : null;
}

test('modern Lab probe animates, advances time, and conserves energy', async ({ page }) => {
  await page.goto('/?modernLabProbe=1');

  // The probe canvas and handle must come up.
  await expect(page.locator('#modern-lab-probe')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as unknown as { __modernLabProbe?: unknown }).__modernLabProbe));

  // Liveness: the canvas pixels must change as the pendulum moves.
  const checksumA = await page.evaluate(canvasChecksum);
  await page.waitForTimeout(500);
  const checksumB = await page.evaluate(canvasChecksum);
  expect(checksumA).toBeGreaterThanOrEqual(0);
  expect(checksumB).not.toBe(checksumA);

  // Time advances.
  const snapA = await page.evaluate(readSnapshot);
  await page.waitForTimeout(400);
  const snapB = await page.evaluate(readSnapshot);
  expect(snapA).not.toBeNull();
  expect(snapB!.time).toBeGreaterThan(snapA!.time);
  expect(snapB!.state).toHaveLength(4);

  // Energy conservation: γ=0 RK4 double pendulum keeps relative drift small.
  expect(snapB!.drift).toBeLessThan(1e-2);

  // The probe canvas is separate from the main lab canvas, which is present.
  const mainPresent = await page.evaluate(() => Boolean(document.getElementById('main')));
  expect(mainPresent).toBe(true);
});
