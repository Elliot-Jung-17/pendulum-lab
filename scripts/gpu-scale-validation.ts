import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { compareClvAcceleration, compareFtleFieldAcceleration, compareLyapunovSpectrumAcceleration } from '../src/chaos/accelerationContract';
import { compareEnsembleStatistics, ensembleGrid, ensembleStatistics, runDoublePendulumEnsemble, webgpuEnsembleStatistics } from '../src/runtime/gpuEnsemble';
import { flipBasinField, sweepLambdaField } from '../src/runtime/gpuFields';
import { GPU_SCALE_VALIDATION_CONTRACTS } from '../src/research/certifiedWorkbench';
import { hashText } from '../src/research/researchExportUtils';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

const grid = ensembleGrid(6, [-1.2, 1.2]);
const ensemble = await runDoublePendulumEnsemble(params, grid, { steps: 80, dt: 0.01, forceCpu: true });
const stats = ensembleStatistics(ensemble.states);
const f32CandidateStats = ensembleStatistics(new Float64Array(new Float32Array(ensemble.states)));
const reductionOracle = compareEnsembleStatistics(f32CandidateStats, stats);
const hardwareReduction = await webgpuEnsembleStatistics(ensemble.states);
const hardwareReductionOracle = hardwareReduction ? compareEnsembleStatistics(hardwareReduction, stats, {
  mean: 2e-5,
  variance: 2e-4,
  covariance: 2e-4,
  rmsSpread: 2e-4,
  flipFraction: 0
}) : null;
const basin = await flipBasinField(params, { n: 12, maxTime: 4, forceCpu: true });
const sweep = await sweepLambdaField(params, { n: 4, range: [0.1, 0.4], steps: 600, forceCpu: true });
const lyapunovAccelerationProbe = compareLyapunovSpectrumAcceleration(
  { spectrum: [0.25, 0.01, -0.02, -0.24], sum: 0, kaplanYorkeDimension: 3.95 },
  { spectrum: [0.251, 0.009, -0.021, -0.239], sum: 0, kaplanYorkeDimension: 3.948 },
  { spectrum: 0.005, aggregate: 0.01 }
);
const clvAccelerationProbe = compareClvAcceleration(
  { exponents: [0.4, -0.3], meanHyperbolicityAngle: 0.78, minHyperbolicityAngle: 0.4 },
  { exponents: [0.401, -0.301], meanHyperbolicityAngle: 0.781, minHyperbolicityAngle: 0.399 },
  { exponents: 0.005, angle: 0.01 }
);
const ftleAccelerationProbe = compareFtleFieldAcceleration(
  { values: Float64Array.of(0.1, 0.2, 0.3, 0.4), width: 2, height: 2, min: 0.1, max: 0.4 },
  { values: Float64Array.of(0.101, 0.199, 0.298, 0.402), width: 2, height: 2, min: 0.101, max: 0.402 },
  { field: 0.01, aggregate: 0.01 }
);

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

interface WebGpuHardwareEvidence {
  status?: string;
  generatedAt?: string;
  ensemble?: { backend?: string; comparison?: { passed?: boolean; maxMeanAbsDiff?: number; maxCovarianceAbsDiff?: number } };
  lyapunovSpectrum?: {
    backend?: string;
    comparison?: { passed?: boolean; metrics?: Record<string, number | boolean> } | null;
  };
}

const hardwareEvidence = await readJson<WebGpuHardwareEvidence>('reports/webgpu-hardware-validation.json');
const hasNavigatorGpu = typeof navigator !== 'undefined' && Boolean((navigator as unknown as { gpu?: unknown }).gpu);
const summary = {
  schemaVersion: 'pendulum-gpu-scale-validation/v2',
  generatedAt: new Date().toISOString(),
  hardwareWebGpuAvailable: hasNavigatorGpu,
  verdict: hardwareEvidence?.status === 'pass'
    ? 'hardware-webgpu-oracle-gates-passed'
    : hasNavigatorGpu ? 'hardware-webgpu-path-available' : 'cpu-reference-mock-and-contract-gates-ready',
  hardwareEvidence,
  contracts: GPU_SCALE_VALIDATION_CONTRACTS,
  cpuReference: {
    ensemble: {
      backend: ensemble.backend,
      n: ensemble.n,
      steps: ensemble.steps,
      dt: ensemble.dt,
      rmsSpread: stats.rmsSpread,
      flipFraction: stats.flipFraction,
      f32ReductionOracle: reductionOracle,
      gpuSideReductionOracle: hardwareReductionOracle,
      gpuSideReductionAvailable: hardwareReduction !== null
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
  },
  promotionGates: {
    lyapunovSpectrum: lyapunovAccelerationProbe,
    clv: clvAccelerationProbe,
    ftleField: ftleAccelerationProbe
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
  `| ensemble reduction oracle | f32 candidate vs CPU f64 | ${ensemble.n} | pass=${reductionOracle.passed}, maxMeanDiff=${reductionOracle.maxMeanAbsDiff.toExponential(3)}, maxCovDiff=${reductionOracle.maxCovarianceAbsDiff.toExponential(3)} |`,
  `| GPU-side reduction oracle | ${hardwareReduction ? 'webgpu' : 'unavailable in this runtime'} | ${ensemble.n} | ${hardwareReductionOracle ? `pass=${hardwareReductionOracle.passed}, maxMeanDiff=${hardwareReductionOracle.maxMeanAbsDiff.toExponential(3)}` : 'requires real WebGPU adapter'} |`,
  `| hardware report reduction oracle | ${hardwareEvidence?.ensemble?.backend ?? 'no report'} | 25 | pass=${String(hardwareEvidence?.ensemble?.comparison?.passed ?? false)}, maxMeanDiff=${typeof hardwareEvidence?.ensemble?.comparison?.maxMeanAbsDiff === 'number' ? hardwareEvidence.ensemble.comparison.maxMeanAbsDiff.toExponential(3) : 'n/a'} |`,
  `| hardware report full-spectrum oracle | ${hardwareEvidence?.lyapunovSpectrum?.backend ?? 'no report'} | 4 exponents | pass=${String(hardwareEvidence?.lyapunovSpectrum?.comparison?.passed ?? false)}, spectrumDiff=${typeof hardwareEvidence?.lyapunovSpectrum?.comparison?.metrics?.spectrumMaxAbsDiff === 'number' ? hardwareEvidence.lyapunovSpectrum.comparison.metrics.spectrumMaxAbsDiff.toExponential(3) : 'n/a'} |`,
  `| flip basin | ${basin.backend} | ${basin.width}x${basin.height} | labelHash=${summary.cpuReference.basin.labelHash} |`,
  `| sweep lambda | ${sweep.backend} | ${sweep.width}x${sweep.height} | lambdaHash=${summary.cpuReference.sweep.lambdaHash} |`,
  `| CLV promotion gate | contract probe | 2 exponents | pass=${clvAccelerationProbe.passed}, exponentDiff=${Number(clvAccelerationProbe.metrics.exponentMaxAbsDiff).toExponential(3)} |`,
  `| full-spectrum promotion gate | contract probe | 4 exponents | pass=${lyapunovAccelerationProbe.passed}, spectrumDiff=${Number(lyapunovAccelerationProbe.metrics.spectrumMaxAbsDiff).toExponential(3)} |`,
  `| FTLE promotion gate | contract probe | 2x2 | pass=${ftleAccelerationProbe.passed}, maxDiff=${Number(ftleAccelerationProbe.metrics.fieldMaxAbsDiff).toExponential(3)} |`,
  '',
  '## CI Evidence',
  '',
  '- `tests/gpu-ensemble.test.ts` verifies CPU fallback and forceCpu A/B control.',
  '- `tests/gpu-fields-validation.test.ts` installs a mock WebGPU device and proves accept/fallback behavior.',
  '- `tests/ensemble-statistics.test.ts` pins the f64 reduction oracle and the f32-candidate comparison gate.',
  '- `e2e/webgpu-hardware-reductions.spec.ts` is the hardware-only gate: it fails unless a real adapter returns `backend=webgpu`, the GPU-side reduction matches the CPU oracle, and the WebGPU full-spectrum candidate passes its CPU f64 promotion gate.',
  '',
  '## CLV / FTLE Promotion Gate',
  '',
  'CLV, full-spectrum, and variational FTLE acceleration now has executable comparison contracts. A GPU path must emit the same public result schema, pass CPU oracle comparisons on representative regular/chaotic cases, attach Trust Inspector caveats, and fail closed to the CPU path when validation is unavailable.',
  ''
);

await mkdir('reports', { recursive: true });
await writeFile('reports/gpu-scale-validation.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await writeFile('reports/gpu-scale-validation.md', `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
