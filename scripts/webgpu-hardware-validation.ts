import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const url = process.env.WEBGPU_VALIDATION_URL ?? 'http://127.0.0.1:5173/';
const channel = process.env.WEBGPU_BROWSER_CHANNEL ?? 'chrome';

async function isReachable(target: string): Promise<boolean> {
  try {
    const response = await fetch(target);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(target: string, timeoutMs = 45_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isReachable(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for dev server at ${target}`);
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await isReachable(url)) return null;
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1 --port 5173']
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'ignore',
    windowsHide: true
  });
  await waitForServer(url);
  return child;
}

function stopServer(child: ChildProcess | null): void {
  if (!child || child.killed) return;
  child.kill();
}

const generatedAt = new Date().toISOString();
let server: ChildProcess | null = null;
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let status: 'pass' | 'fail' = 'fail';
let payload: Record<string, unknown> = {};

interface WebGpuHardwareReport {
  schemaVersion: 'pendulum-webgpu-hardware-validation/v1';
  generatedAt: string;
  channel: string;
  url: string;
  status: 'pass' | 'fail';
  ensemble?: {
    backend?: string;
    comparison?: {
      passed?: boolean;
      maxMeanAbsDiff?: number;
      maxCovarianceAbsDiff?: number;
      rmsSpreadAbsDiff?: number;
    };
    rmsSpreadGpu?: number;
    rmsSpreadCpu?: number;
    n?: number;
  };
  lyapunovSpectrum?: {
    backend?: string;
    comparison?: {
      passed?: boolean;
      metrics?: Record<string, number | boolean>;
    } | null;
    spectrum?: number[];
    cpuSpectrum?: number[];
    caveat?: string;
  };
  error?: string;
  /** Backwards-compatible top-level fields consumed by older scorecards. */
  backend?: string;
  comparison?: {
    passed?: boolean;
    maxMeanAbsDiff?: number;
    maxCovarianceAbsDiff?: number;
    rmsSpreadAbsDiff?: number;
  };
  rmsSpreadGpu?: number;
  rmsSpreadCpu?: number;
  n?: number;
}

try {
  server = await ensureServer();
  browser = await chromium.launch({
    channel,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UnsafeWebGPU']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  payload = await page.evaluate(async () => {
    const gpuApi = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown | null> } }).gpu;
    if (!gpuApi) {
      throw new Error('navigator.gpu unavailable; this runner is not a WebGPU hardware target.');
    }
    const adapter = await gpuApi.requestAdapter();
    if (!adapter) {
      throw new Error('navigator.gpu.requestAdapter() returned null.');
    }
    const ensembleModulePath = '/src/runtime/gpuEnsemble.ts';
    const spectrumModulePath = '/src/runtime/gpuLyapunov.ts';
    const mod = await import(/* @vite-ignore */ ensembleModulePath) as typeof import('../src/runtime/gpuEnsemble');
    const spectrumMod = await import(/* @vite-ignore */ spectrumModulePath) as typeof import('../src/runtime/gpuLyapunov');
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const initial = mod.ensembleGrid(5, [-1.1, 1.1]);
    const gpuRun = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01 });
    const cpu = await mod.runDoublePendulumEnsemble(params, initial, { steps: 80, dt: 0.01, forceCpu: true });
    const gpuStats = await mod.webgpuEnsembleStatistics(gpuRun.states);
    if (!gpuStats) throw new Error('GPU-side reduction returned null.');
    const cpuStats = mod.ensembleStatistics(cpu.states);
    const comparison = mod.compareEnsembleStatistics(gpuStats, cpuStats, {
      mean: 4e-4,
      variance: 3e-3,
      covariance: 3e-3,
      rmsSpread: 3e-3,
      flipFraction: 0
      });
    const lyapunovPromotion = await spectrumMod.promotedDoublePendulumLyapunovSpectrum(
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
      backend: gpuRun.backend,
      comparison,
      rmsSpreadGpu: gpuStats.rmsSpread,
      rmsSpreadCpu: cpuStats.rmsSpread,
      n: gpuStats.n,
      ensemble: {
        backend: gpuRun.backend,
        comparison,
        rmsSpreadGpu: gpuStats.rmsSpread,
        rmsSpreadCpu: cpuStats.rmsSpread,
        n: gpuStats.n
      },
      lyapunovSpectrum: {
        backend: lyapunovPromotion.backend,
        comparison: lyapunovPromotion.comparison,
        spectrum: lyapunovPromotion.result.spectrum,
        cpuSpectrum: lyapunovPromotion.cpuOracle.spectrum,
        caveat: lyapunovPromotion.caveat
      }
    };
  });
  const ensemble = payload.ensemble as WebGpuHardwareReport['ensemble'] | undefined;
  const lyapunovSpectrum = payload.lyapunovSpectrum as WebGpuHardwareReport['lyapunovSpectrum'] | undefined;
  const ensemblePassed = ensemble?.backend === 'webgpu' && ensemble.comparison?.passed;
  const spectrumPassed = lyapunovSpectrum?.backend === 'webgpu' && lyapunovSpectrum.comparison?.passed;
  status = ensemblePassed && spectrumPassed ? 'pass' : 'fail';
} catch (error) {
  payload = { error: error instanceof Error ? error.message : String(error) };
} finally {
  await browser?.close().catch(() => undefined);
  stopServer(server);
}

await mkdir('reports', { recursive: true });
const report: WebGpuHardwareReport = {
  schemaVersion: 'pendulum-webgpu-hardware-validation/v1',
  generatedAt,
  channel,
  url,
  status,
  ...(payload as Partial<WebGpuHardwareReport>)
};
await writeFile('reports/webgpu-hardware-validation.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const ensemble = report.ensemble ?? {
  backend: report.backend,
  comparison: report.comparison,
  rmsSpreadGpu: report.rmsSpreadGpu,
  rmsSpreadCpu: report.rmsSpreadCpu,
  n: report.n
};
const ensembleComparison = ensemble.comparison;
const spectrumComparison = report.lyapunovSpectrum?.comparison;
const spectrumMetrics = spectrumComparison?.metrics ?? {};
const lines = [
  '# WebGPU Hardware Validation',
  '',
  `Generated: ${generatedAt}`,
  '',
  `Status: **${status}**`,
  '',
  `Browser channel: \`${channel}\``,
  '',
  `Ensemble backend: \`${String(ensemble.backend ?? 'n/a')}\``,
  '',
  `Full-spectrum backend: \`${String(report.lyapunovSpectrum?.backend ?? 'n/a')}\``,
  '',
  '## Ensemble Reduction',
  '',
  '| Metric | Value |',
  '|---|---:|',
  `| n | ${String(ensemble.n ?? 'n/a')} |`,
  `| rmsSpread GPU | ${typeof ensemble.rmsSpreadGpu === 'number' ? ensemble.rmsSpreadGpu.toPrecision(8) : 'n/a'} |`,
  `| rmsSpread CPU | ${typeof ensemble.rmsSpreadCpu === 'number' ? ensemble.rmsSpreadCpu.toPrecision(8) : 'n/a'} |`,
  `| max mean diff | ${ensembleComparison?.maxMeanAbsDiff?.toExponential(3) ?? 'n/a'} |`,
  `| max covariance diff | ${ensembleComparison?.maxCovarianceAbsDiff?.toExponential(3) ?? 'n/a'} |`,
  `| rms spread diff | ${ensembleComparison?.rmsSpreadAbsDiff?.toExponential(3) ?? 'n/a'} |`,
  '',
  '## Full-Spectrum Promotion',
  '',
  '| Metric | Value |',
  '|---|---:|',
  `| passed | ${String(spectrumComparison?.passed ?? false)} |`,
  `| spectrum max abs diff | ${typeof spectrumMetrics.spectrumMaxAbsDiff === 'number' ? spectrumMetrics.spectrumMaxAbsDiff.toExponential(3) : 'n/a'} |`,
  `| sum abs diff | ${typeof spectrumMetrics.sumAbsDiff === 'number' ? spectrumMetrics.sumAbsDiff.toExponential(3) : 'n/a'} |`,
  `| Kaplan-Yorke abs diff | ${typeof spectrumMetrics.kaplanYorkeAbsDiff === 'number' ? spectrumMetrics.kaplanYorkeAbsDiff.toExponential(3) : 'n/a'} |`,
  '',
  status === 'pass'
    ? 'The on-device WebGPU ensemble reduction and full-spectrum Lyapunov candidate matched the CPU f64 oracle within the declared f32 tolerances.'
    : `Failure: ${String(report.error ?? 'comparison failed')}`,
  ''
];
await writeFile('reports/webgpu-hardware-validation.md', lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
if (status !== 'pass') process.exitCode = 1;
