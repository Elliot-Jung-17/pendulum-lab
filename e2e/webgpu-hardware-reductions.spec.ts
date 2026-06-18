import { expect, test } from '@playwright/test';

test.use({
  channel: (process.env.WEBGPU_BROWSER_CHANNEL || 'chrome') as 'chrome',
  launchOptions: {
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UnsafeWebGPU']
  }
});

test('real WebGPU ensemble reduction matches the CPU oracle', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGPU hardware validation is Chromium-only.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    if (!(navigator as unknown as { gpu?: unknown }).gpu) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware CI target.');
    }
    const modulePath = '/src/runtime/gpuEnsemble.ts';
    const mod = await import(/* @vite-ignore */ modulePath) as typeof import('../src/runtime/gpuEnsemble');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const initial = mod.ensembleGrid(5, [-1.1, 1.1]);
    const gpu = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01 });
    const cpu = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01, forceCpu: true });
    const gpuStats = await mod.webgpuEnsembleStatistics(gpu.states);
    if (!gpuStats) throw new Error('GPU-side reduction returned null.');
    const cpuStats = mod.ensembleStatistics(cpu.states);
    const comparison = mod.compareEnsembleStatistics(gpuStats, cpuStats, {
      mean: 4e-4,
      variance: 3e-3,
      covariance: 3e-3,
      rmsSpread: 3e-3,
      flipFraction: 0
    });
    return {
      backend: gpu.backend,
      comparison,
      rmsSpreadGpu: gpuStats.rmsSpread,
      rmsSpreadCpu: cpuStats.rmsSpread
    };
  });
  expect(result.backend).toBe('webgpu');
  expect(result.comparison.passed).toBe(true);
  expect(Math.abs(result.rmsSpreadGpu - result.rmsSpreadCpu)).toBeLessThanOrEqual(result.comparison.tolerances.rmsSpread);
});

test('real WebGPU full-spectrum Lyapunov candidate passes CPU oracle promotion gate', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGPU hardware validation is Chromium-only.');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    if (!(navigator as unknown as { gpu?: unknown }).gpu) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware CI target.');
    }
    const modulePath = '/src/runtime/gpuLyapunov.ts';
    const mod = await import(/* @vite-ignore */ modulePath) as typeof import('../src/runtime/gpuLyapunov');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const promotion = await mod.promotedDoublePendulumLyapunovSpectrum(
      params,
      [1.2, 0.7, 0.12, -0.04],
      {
        dt: 0.01,
        steps: 320,
        renormEvery: 8,
        transientSteps: 40,
        seed: 0x1234,
        tolerances: { spectrum: 0.1, aggregate: 0.12 }
      }
    );
    return {
      backend: promotion.backend,
      passed: promotion.comparison?.passed ?? false,
      metrics: promotion.comparison?.metrics ?? null,
      spectrum: promotion.result.spectrum,
      cpuSpectrum: promotion.cpuOracle.spectrum,
      caveat: promotion.caveat
    };
  });
  expect(result.backend).toBe('webgpu');
  expect(result.passed).toBe(true);
  expect(result.metrics).not.toBeNull();
  expect(result.spectrum.length).toBe(4);
  expect(result.cpuSpectrum.length).toBe(4);
});
