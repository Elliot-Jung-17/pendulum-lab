// Verify the self-contained root index.html opens from the file system
// (double-click scenario): the modern shell boots and no page errors fire.
//   node scripts/verify-standalone.mjs
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = pathToFileURL(resolve('index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(target);
await page.waitForFunction(() => Boolean(window.__modernShell), undefined, { timeout: 20_000 });
await page.waitForTimeout(1500);

const canvasDrawn = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return Boolean(canvas && canvas.width > 0);
});

await browser.close();

if (pageErrors.length > 0) {
  console.error(`standalone FAILED: ${pageErrors.length} page error(s):\n${pageErrors.join('\n')}`);
  process.exit(1);
}
if (!canvasDrawn) {
  console.error('standalone FAILED: no drawn canvas');
  process.exit(1);
}
console.log(`standalone OK: ${target} boots the modern shell via file:// with no page errors`);
