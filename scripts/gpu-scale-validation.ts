import { mkdir, writeFile } from 'node:fs/promises';
import { ensembleGrid, ensembleStatistics, runDoublePendulumEnsemble } from '../src/runtime/gpuEnsemble';
import { flipBasinField, sweepLambdaField } from '../src/runtime/gpuFields';
import { GPU_SCALE_VALIDATION_CONTRACTS } from '../src/research/certifiedWorkbench';
import { hashText } from '../src/research/researchExportUtils';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

const grid = ensembleGrid(6, [-1.2, 1.2]);
const ensemble = await runDoublePendulumEnsemble(params, grid, { steps: 80, dt: 0.01, forceCpu: true });
const stats = ensembleStatistics(ensemble.states);
const basin = await flipBasinField(params, { n: 12, maxTime: 4, forceCpu: true });
const sweep = await sweepLambdaField(params, { n: 4, range: [0.1, 0.4], steps: 600, forceCpu: true });

const hasNavigatorGpu = typeof navigator !== 'undefined' && Boolean((navigator as unknown as { gpu?: unknown }).gpu);
const summary = {
  schemaVersion: 'pendulum-gpu-scale-validation/v1',
  generatedAt: new Date().toISOString(),
  hardwareWebGpuAvailable: hasNavigatorGpu,
  verdict: hasNavigatorGpu ? 'hardware-webgpu-path-available' : 'cpu-reference-and-mock-contract-only',
  contracts: GPU_SCALE_VALIDATION_CONTRACTS,
  cpuReference: {
    ensemble: {
      backend: ensemble.backend,
      n: ensemble.n,
      steps: ensemble.steps,
      dt: ensemble.dt,
      rmsSpread: stats.rmsSpread,
      flipFraction: stats.flipFraction
    },
    basin: {
      backend: basin.backend,
      width: basin.width,
      height: basin.height,
      validation: basin.validation,
      labelHash: hashText(Array.from(basin.labels).join(',')).slice(0, 16)
    },
    sweep: {
      backend: sweep.backend,
      width: sweep.width,
      height: sweep.height,
      validation: sweep.validation,
      lambdaHash: hashText(Array.from(sweep.values).map((v) => v.toPrecision(8)).join(',')).slice(0, 16)
    }
  }
};

const lines = [
  '# GPU / Scale Validation Contract',
  '',
  `Generated: ${summary.generatedAt}`,
  '',
  `Verdict: **${summary.verdict}**`,
  '',
  'This report deliberately separates scientific trust from acceleration. The CPU f64 path is the oracle; WebGPU may accelerate only when it either validates against CPU probes or falls back to CPU.',
  '',
  '## Contracts',
  '',
  '| ID | CPU Reference | Accelerated Path | Acceptance Rule | Caveat |',
  '|---|---|---|---|---|'
];
for (const contract of GPU_SCALE_VALIDATION_CONTRACTS) {
  lines.push(`| ${contract.id} | ${contract.cpuReference} | ${contract.acceleratedPath} | ${contract.acceptanceRule} | ${contract.caveat} |`);
}
lines.push(
  '',
  '## Current CPU Reference Sample',
  '',
  '| Probe | Backend | Size | Hash / Metric |',
  '|---|---|---:|---|',
  `| ensemble | ${ensemble.backend} | ${ensemble.n} | rmsSpread=${stats.rmsSpread.toPrecision(5)}, flipFraction=${stats.flipFraction.toPrecision(4)} |`,
  `| flip basin | ${basin.backend} | ${basin.width}x${basin.height} | labelHash=${summary.cpuReference.basin.labelHash} |`,
  `| sweep lambda | ${sweep.backend} | ${sweep.width}x${sweep.height} | lambdaHash=${summary.cpuReference.sweep.lambdaHash} |`,
  '',
  '## CI Evidence',
  '',
  '- `tests/gpu-ensemble.test.ts` verifies CPU fallback and forceCpu A/B control.',
  '- `tests/gpu-fields-validation.test.ts` installs a mock WebGPU device and proves accept/fallback behavior.',
  '- `tests/ensemble-statistics.test.ts` pins the f64 reduction oracle.',
  ''
);

await mkdir('reports', { recursive: true });
await writeFile('reports/gpu-scale-validation.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await writeFile('reports/gpu-scale-validation.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
