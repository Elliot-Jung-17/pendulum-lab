import { cp, mkdir, copyFile, access } from 'node:fs/promises';

// The legacy `js/` runtime has been archived (see archive/js/); the modern build
// is entirely TypeScript under src/. We still ship the hand-written CSS that
// styles the static shell DOM.
await mkdir('dist/css', { recursive: true });
await cp('css', 'dist/css', { recursive: true });

// The dev/build source shell is `app.html`; deployments (and Vite preview)
// expect the page at `index.html`. Mirror the built shell to that canonical
// name so a static host serves it at the web root.
try {
  await access('dist/app.html');
  await copyFile('dist/app.html', 'dist/index.html');
  console.log('Copied dist/app.html -> dist/index.html');
} catch {
  // app.html may be absent if the build emitted a different layout; ignore.
}
