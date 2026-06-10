import { readFile, writeFile, rm, readdir, copyFile } from 'node:fs/promises';

// The standalone build inlines all JS into one HTML file, but the hand-written
// CSS is linked statically (not a Vite asset), so the single-file plugin leaves
// the <link> tags pointing at ./css/*.css. Inline those into <style> blocks so
// the result is truly one self-contained file that opens via file:// with no
// sibling assets.
//
// The standalone build's input is `app.html`, so it emits `standalone/app.html`.
// We inline the CSS and then write the finished single file to two places:
//   - standalone/index.html  (the documented standalone artifact)
//   - index.html             (the project root, so double-clicking it just runs)
const builtPath = 'standalone/app.html';
let html = await readFile(builtPath, 'utf8');

const linkRe = /<link[^>]*rel="stylesheet"[^>]*href="\.\/(css\/[^"]+\.css)"[^>]*>/gi;
const matches = [...html.matchAll(linkRe)];
for (const m of matches) {
  const cssPath = m[1];
  let css = '';
  try {
    css = await readFile(cssPath, 'utf8');
  } catch {
    continue; // leave the link if the file is missing
  }
  html = html.replace(m[0], `<style data-inlined-from="${cssPath}">\n${css}\n</style>`);
}

await writeFile('standalone/index.html', html, 'utf8');
await writeFile('index.html', html, 'utf8');
// Remove the intermediate so only the canonical index.html remains in standalone/.
await rm(builtPath, { force: true });

// The chaos Web Worker is emitted as a sibling .js (not inlined). Place a copy
// next to the root index.html so the worker also loads when the root file is
// served from a static host or opened in a browser that permits file:// workers
// (otherwise the app transparently falls back to the main thread). Stale hashed
// copies are cleared first so the root does not accumulate old worker bundles.
const standaloneFiles = await readdir('standalone');
const workerFiles = standaloneFiles.filter((f) => /\.worker.*\.js$/i.test(f));
const rootFiles = await readdir('.');
for (const f of rootFiles.filter((f) => /\.worker.*\.js$/i.test(f))) await rm(f, { force: true });
for (const f of workerFiles) await copyFile(`standalone/${f}`, f);

console.log(
  `Wrote self-contained standalone/index.html and root index.html` +
    (workerFiles.length ? ` (+${workerFiles.length} worker sibling${workerFiles.length > 1 ? 's' : ''})` : '')
);
