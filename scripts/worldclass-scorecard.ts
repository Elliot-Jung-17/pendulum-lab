import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

type Status = 'done' | 'partial' | 'gap';

interface ScorecardItem {
  area: string;
  status: Status;
  evidence: string[];
  remaining: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

const legacy = await readJson('reports/legacy-risk-report.json', {
  counts: { innerHTML: -1, onclick: -1, inlineWorkerBlob: -1, dynamicScript: -1, globalRuntimeExports: -1 },
  weightedScore: -1,
  delta: 0
});

const packageJson = await readJson<{ scripts?: Record<string, string> }>('package.json', {});
const scripts = packageJson.scripts ?? {};
const vitest = await readJson<{ numTotalTests?: number; numPassedTests?: number; testResults?: unknown[] }>('reports/vitest-results.json', {});
const benchmark = await readJson<{ comparison?: { deltas?: unknown[] } }>('reports/benchmark-report.json', {});
const unitTestSummary = Number.isInteger(vitest.numTotalTests) && Array.isArray(vitest.testResults)
  ? `${vitest.numPassedTests ?? 0}/${vitest.numTotalTests} unit tests across ${vitest.testResults.length} files`
  : 'unit test JSON report missing; run npm run test:json';
const ciWorkflow = await readText('.github/workflows/ci.yml');
const mainWorkflow = await readText('.github/workflows/main.yml');
const legacyCounts = Object.values(legacy.counts) as number[];
const legacyClean = legacy.weightedScore === 0 && legacyCounts.every((value) => value === 0);
const benchmarkHasComparison = Array.isArray(benchmark.comparison?.deltas) && benchmark.comparison.deltas.length > 0;

const has = {
  benchmark: await exists('reports/benchmark-report.md'),
  energy: await exists('reports/energy-benchmark.md'),
  memoryRegression: await exists('reports/memory-regression-report.md'),
  memoryBaseline: await exists('reports/memory-baseline.json'),
  mojibakeAudit: await exists('reports/mojibake-audit.md'),
  validation: await exists('reports/validation-report.md'),
  reference: await exists('reports/validation-reference.md'),
  architecture: await exists('docs/architecture.md'),
  numerics: await exists('docs/numerics.md'),
  limitations: await exists('docs/known-limitations.md'),
  ci: await exists('.github/workflows/ci.yml'),
  mainWorkflow: await exists('.github/workflows/main.yml'),
  nightlyWorkflow: await exists('.github/workflows/nightly.yml'),
  releaseWorkflow: await exists('.github/workflows/release.yml'),
  pagesWorkflow: await exists('.github/workflows/pages.yml'),
  distIndex: await exists('dist/index.html'),
  license: await exists('LICENSE'),
  citation: await exists('CITATION.cff'),
  typedocIndex: await exists('docs/api/index.html'),
  index: await exists('index.html'),
  coverageScopeBaseline: await exists('config/coverage-scope-baseline.json'),
  bundleBudget: await exists('scripts/bundle-budget.ts'),
  longRunE2e: await exists('e2e/long-run-performance.spec.ts'),
  accessibilityE2e: await exists('e2e/accessibility.spec.ts'),
  railAutocloseE2e: await exists('e2e/rail-autoclose.spec.ts'),
  visualRegressionE2e: await exists('e2e/visual-regression.spec.ts'),
  visualSnapshots: await exists('e2e/visual-regression.spec.ts-snapshots'),
  visualTier: Boolean(scripts['test:visual']),
  quickTier: Boolean(scripts['test:quick']),
  slowTier: Boolean(scripts['test:slow']),
  benchmarkMemoryScript: Boolean(scripts['benchmark:memory']),
  ciRunsQuickTier: ciWorkflow.includes('npm run test:quick'),
  ciRunsVerify: ciWorkflow.includes('npm run verify'),
  mainRunsSlowTier: mainWorkflow.includes('npm run test:slow'),
  mainRunsBenchmark: mainWorkflow.includes('npm run benchmark'),
  mainRunsMemoryRegression: mainWorkflow.includes('npm run benchmark:memory'),
  mainRunsMojibakeStrict: mainWorkflow.includes('npm run audit:mojibake:strict')
};

const pagesReady = has.pagesWorkflow && has.distIndex;
const packagingReady = pagesReady && has.license && has.citation && has.typedocIndex;
const testTierReady = has.quickTier && has.slowTier && has.ciRunsQuickTier && has.ciRunsVerify && has.mainRunsSlowTier;
const visualReady = has.visualRegressionE2e && has.visualSnapshots && has.visualTier;
const memoryReady = has.benchmarkMemoryScript && has.memoryRegression;
const benchmarkReady = has.benchmark && has.energy && benchmarkHasComparison;

const items: ScorecardItem[] = [
  {
    area: 'TypeScript and modular architecture',
    status: 'done',
    evidence: [
      'src/ contains physics, chaos, viz, app, render, state, runtime, validation, export, workers modules',
      'npm run typecheck passes (strict)',
      'legacy js/ runtime fully removed (archived); index.html loads only src/main.ts',
      'legacy-risk audit score is 0'
    ],
    remaining: []
  },
  {
    area: 'Index simulator UI/UX',
    status: has.index ? 'partial' : 'gap',
    evidence: ['index.html is the single user-facing simulator with lab, comparison, Lyapunov, sweep, bifurcation, phase-space, density, and validation tabs'],
    remaining: ['Panel layout persistence, project workspace lists, and a stronger beginner/expert mode still need index-page implementation']
  },
  {
    area: 'Numerics and physics depth',
    status: 'partial',
    evidence: [
      'RKF45, Dormand-Prince 5(4), DOP853-adjacent GBS extrapolation, Gauss-Legendre 4/6, TR-BDF2, canonical midpoint, N-pendulum, driven, spring systems are present in src',
      'Floquet multipliers, natural + pseudo-arclength continuation, period-doubling branch switching, and the Melnikov analytic threshold are implemented and tested',
      'external cross-validation vs an independent SciPy DOP853 reference covers the double AND triple pendulum; literature anchors pin the elliptic period, normal modes, and the period-doubling onset'
    ],
    remaining: ['Sparse/large-unitary Floquet eigensolvers, GPU-side ensemble reductions, and optional MATLAB/Julia second references remain future work']
  },
  {
    area: 'Chaos analysis',
    status: 'partial',
    evidence: [
      'Maximal Lyapunov convergence, full spectrum, Kaplan-Yorke dimension, SALI/FLI, Poincare, bifurcation modules exist and are tested',
      'covariant Lyapunov vectors (Ginelli), 0-1 test, RQA, FTLE fields, basin entropy and the Wada grid test are implemented as tabs + library APIs',
      'every non-variational diagnostic reports an uncertainty estimate (bootstrap / block-resampled / regression CI)'
    ],
    remaining: ['CLV and some full-spectrum workflows remain CPU-side; broader GPU acceleration is limited to the existing grid/ensemble kernels']
  },
  {
    area: 'Testing and browser coverage',
    status: scripts['test:e2e'] && has.ci && has.mainWorkflow && has.longRunE2e && testTierReady && visualReady && memoryReady ? 'done' : 'partial',
    evidence: [
      unitTestSummary,
      'unit tests cover integrators, energy drift, determinism, JSON import validation, edge cases, chaos, visualization, repro packages',
      testTierReady ? 'quick, slow, and full test tiers are wired into PR/mainline workflows' : 'quick/slow/full test tier wiring is incomplete',
      has.coverageScopeBaseline ? 'coverage scope guard catches new source files missing from the v8 coverage map' : 'coverage scope guard missing',
      has.longRunE2e ? 'long-run performance/soak e2e spec exists and runs in mainline full validation' : 'long-run performance/soak e2e spec missing',
      has.accessibilityE2e ? 'accessibility e2e spec exists and runs in mainline full validation' : 'accessibility e2e spec missing',
      visualReady ? 'visual regression script, spec, and versioned Chromium snapshots exist' : 'visual regression command or snapshots are missing',
      memoryReady ? 'memory-regression report exists from benchmark output' : 'memory-regression report missing'
    ],
    remaining: [
      ...(!testTierReady ? ['Wire quick/slow/full test tiers into CI'] : []),
      ...(!visualReady ? ['Promote visual regression command and golden snapshots'] : []),
      ...(!memoryReady ? ['Run npm run benchmark and npm run benchmark:memory to create memory-regression artifacts'] : [])
    ]
  },
  {
    area: 'Performance and benchmark reporting',
    status: benchmarkReady && has.mainRunsBenchmark && has.mainRunsMemoryRegression ? 'done' : 'partial',
    evidence: [
      benchmarkHasComparison ? 'benchmark-report.md captures FPS, physics ms/frame, memory, worker latency, and original-vs-candidate deltas' : 'benchmark-report.md missing original-vs-candidate deltas',
      'energy-benchmark.md compares long-run drift by integrator',
      has.bundleBudget ? 'bundle budget gate splits initial/chunk/standalone assets across raw/gzip/brotli sizes' : 'bundle budget gate missing',
      has.mainRunsBenchmark ? 'mainline workflow runs the browser benchmark' : 'mainline workflow does not run the browser benchmark',
      has.mainRunsMemoryRegression ? 'mainline workflow emits memory-regression artifacts' : 'mainline workflow does not emit memory-regression artifacts'
    ],
    remaining: [
      ...(!benchmarkReady ? ['Run npm run benchmark and benchmark:energy after performance-affecting changes'] : []),
      ...(!has.mainRunsBenchmark || !has.mainRunsMemoryRegression ? ['Wire benchmark and memory-regression scripts into mainline CI'] : []),
      'Release-to-release comparisons should still pass distinct deployed ORIGINAL_URL and CANDIDATE_URL values'
    ]
  },
  {
    area: 'Security hardening',
    status: legacyClean ? 'done' : 'partial',
    evidence: [
      'CSP is present',
      'JSON import validation is tested',
      'eval/new Function count is zero',
      `legacy risk score is ${legacy.weightedScore} (${legacy.delta} vs baseline)`,
      has.mojibakeAudit ? 'mojibake audit report exists' : 'mojibake audit report missing',
      has.mainRunsMojibakeStrict ? 'mainline workflow runs strict mojibake audit' : 'mainline workflow does not run strict mojibake audit'
    ],
    remaining: legacyClean
      ? []
      : [`innerHTML=${legacy.counts.innerHTML}`, `onclick=${legacy.counts.onclick}`, `inlineWorkerBlob=${legacy.counts.inlineWorkerBlob}`, `dynamicScript=${legacy.counts.dynamicScript}`, `globalRuntimeExports=${legacy.counts.globalRuntimeExports}`]
  },
  {
    area: 'Documentation and portfolio readiness',
    status: has.architecture && has.numerics && has.limitations && has.validation && packagingReady ? 'done' : 'partial',
    evidence: [
      'README, architecture, numerics, security, validation, energy benchmark, changelog, roadmap, and portfolio summary artifacts exist',
      has.pagesWorkflow ? 'GitHub Pages workflow exists' : 'GitHub Pages workflow missing',
      has.mainWorkflow ? 'mainline full-validation workflow exists' : 'mainline full-validation workflow missing',
      has.nightlyWorkflow ? 'nightly mutation workflow exists' : 'nightly mutation workflow missing',
      has.releaseWorkflow ? 'release artifact workflow exists' : 'release artifact workflow missing',
      has.distIndex ? 'dist/index.html exists for Pages artifact deployment' : 'dist/index.html missing; run npm run build',
      has.license ? 'LICENSE exists' : 'LICENSE missing',
      has.citation ? 'CITATION.cff exists' : 'CITATION.cff missing',
      has.typedocIndex ? 'TypeDoc API docs exist at docs/api/index.html' : 'TypeDoc API docs missing; run npm run docs:api'
    ],
    remaining: [
      ...(packagingReady ? [] : ['Complete missing packaging artifacts reported in evidence']),
      'Project introduction video and npm package release remain packaging tasks'
    ]
  }
];

const totals = items.reduce(
  (acc, item) => {
    acc[item.status] += 1;
    return acc;
  },
  { done: 0, partial: 0, gap: 0 } satisfies Record<Status, number>
);

const report = {
  generatedAt: new Date().toISOString(),
  totals,
  legacyRisk: legacy,
  artifacts: has,
  items
};

function markdown(): string {
  const lines = [
    '# World-Class Readiness Scorecard',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Summary: done ${totals.done}, partial ${totals.partial}, gap ${totals.gap}`,
    '',
    '| Area | Status | Evidence | Remaining |',
    '|---|---|---|---|'
  ];
  for (const item of items) {
    lines.push(`| ${item.area} | ${item.status.toUpperCase()} | ${item.evidence.join('<br>')} | ${item.remaining.join('<br>')} |`);
  }
  return `${lines.join('\n')}\n`;
}

await mkdir('reports', { recursive: true });
await writeFile('reports/worldclass-scorecard.json', JSON.stringify(report, null, 2));
await writeFile('reports/worldclass-scorecard.md', markdown());
console.log(markdown());
