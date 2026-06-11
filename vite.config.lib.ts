import { defineConfig } from 'vite';

/**
 * Library build: packages the headless research core (src/lib.ts) as an ES
 * module for reuse outside the app (Node scripts, other front-ends, papers'
 * analysis pipelines). Type declarations are emitted separately by
 * `tsc -p tsconfig.lib.json`; API docs by `npm run docs:api`.
 */
export default defineConfig({
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: 'src/lib.ts',
      name: 'PendulumLabCore',
      formats: ['es'],
      fileName: () => 'pendulum-lab-core.js'
    },
    rollupOptions: {
      output: { exports: 'named' }
    }
  }
});
