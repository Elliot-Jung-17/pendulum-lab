import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'reports/coverage',
      // Only the source tree; `all: false` keeps the v8 provider off generated
      // bundles (root worker file, dist), whose source maps crash its
      // untested-file remapping pass.
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/demo/**'],
      all: false,
      // Ratchet thresholds (CI gate via `npm run test:coverage`): set just
      // below the measured baseline so coverage can only go up. Raise them
      // deliberately when coverage improves.
      thresholds: {
        // Measured baseline (2026-06): physics 55.8% branches (defensive ??
        // fallbacks dominate), chaos 65.6%, research ≥ 70%.
        'src/physics/**': { statements: 85, branches: 55, functions: 85 },
        'src/chaos/**': { statements: 80, branches: 65, functions: 80 },
        'src/research/**': { statements: 75, branches: 70, functions: 75 }
      }
    }
  }
});
