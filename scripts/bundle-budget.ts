import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Bundle budget gate. Fails (exit 1) when the production build exceeds the
 * budgets below — a ratchet against silent bundle growth. Run after
 * `npm run build` (and `build:standalone` for the single-file budget).
 */

interface Budget {
  label: string;
  bytes: number;
  budget: number;
}

const BUDGETS = {
  /** Sum of all dist/assets JS (raw bytes). */
  totalJsRaw: 800 * 1024,
  /** Largest single JS chunk, gzipped. */
  largestChunkGzip: 170 * 1024,
  /** All CSS, raw. */
  totalCssRaw: 120 * 1024,
  /** The self-contained standalone page, raw. */
  standaloneHtml: 900 * 1024
};

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const rows: Budget[] = [];
  let totalJs = 0;
  let totalCss = 0;
  let largestGzip = 0;
  let largestName = '';
  const assetsDir = 'dist/assets';
  for (const name of await readdir(assetsDir)) {
    const full = join(assetsDir, name);
    const size = await fileSize(full);
    if (name.endsWith('.js')) {
      totalJs += size;
      const gz = gzipSync(await readFile(full)).length;
      if (gz > largestGzip) {
        largestGzip = gz;
        largestName = name;
      }
    } else if (name.endsWith('.css')) {
      totalCss += size;
    }
  }
  rows.push({ label: 'dist JS total (raw)', bytes: totalJs, budget: BUDGETS.totalJsRaw });
  rows.push({ label: `largest chunk gzip (${largestName})`, bytes: largestGzip, budget: BUDGETS.largestChunkGzip });
  rows.push({ label: 'dist CSS total (raw)', bytes: totalCss, budget: BUDGETS.totalCssRaw });
  const standalone = await fileSize('standalone/index.html');
  if (standalone > 0) rows.push({ label: 'standalone/index.html (raw)', bytes: standalone, budget: BUDGETS.standaloneHtml });

  let failed = 0;
  for (const row of rows) {
    const ok = row.bytes <= row.budget;
    if (!ok) failed += 1;
    const kb = (n: number): string => `${(n / 1024).toFixed(1)} KiB`;
    console.log(`${ok ? 'OK  ' : 'OVER'}  ${row.label}: ${kb(row.bytes)} / budget ${kb(row.budget)}`);
  }
  if (failed > 0) {
    console.error(`bundle budget exceeded in ${failed} row(s) — raise the budget intentionally or shrink the bundle`);
    process.exitCode = 1;
    return;
  }
  console.log('bundle budget passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
