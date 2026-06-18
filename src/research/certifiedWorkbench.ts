/**
 * Certified Chaotic Dynamics Workbench: the outward-facing research contract.
 *
 * The project has many solvers, diagnostics, and UI surfaces. This module names
 * the single flagship result and the reviewer kit that lets an outside reader
 * reproduce it quickly without first learning the whole app.
 */

export type ReviewerKitPriority = 'required' | 'recommended' | 'optional';
export type ReviewerKitStatus = 'ready' | 'missing-required' | 'missing-recommended';

export interface FlagshipResult {
  id: string;
  title: string;
  shortName: string;
  thesis: string;
  primaryMetric: string;
  flagshipCommand: string;
  paperCommand: string;
  trustContract: string[];
  evidenceArtifacts: string[];
  caveats: string[];
}

export interface ReviewerKitArtifact {
  id: string;
  path: string;
  command: string;
  priority: ReviewerKitPriority;
  description: string;
}

export interface ReviewerKitEvaluation {
  status: ReviewerKitStatus;
  ready: ReviewerKitArtifact[];
  missingRequired: ReviewerKitArtifact[];
  missingRecommended: ReviewerKitArtifact[];
  missingOptional: ReviewerKitArtifact[];
}

export interface GpuScaleValidationContract {
  id: string;
  cpuReference: string;
  acceleratedPath: string;
  acceptanceRule: string;
  ciEvidence: string[];
  caveat: string;
}

export const CERTIFIED_WORKBENCH_FLAGSHIP: FlagshipResult = {
  id: 'melnikov-gap-map',
  shortName: 'Melnikov gap map',
  title: 'Melnikov threshold vs period-doubling onset: a quantitative gap map',
  thesis:
    'For the damped driven pendulum at omega=2/3, the analytic Melnikov homoclinic-tangle threshold and the measured period-doubling onset are distinct objects; their ratio closes and reverses near gamma ~= 0.69.',
  primaryMetric: 'A_PD(gamma) / A_c(gamma), with A_PD located by Floquet multiplier rho=-1 and A_c from the closed-form Melnikov integral.',
  flagshipCommand: 'npm run paper:study',
  paperCommand: 'npm run paper:build',
  trustContract: [
    'A_c is analytic and pinned by quadrature in tests.',
    'A_PD is measured on the attractor branch and refined by the monodromy/Floquet multiplier crossing rho=-1.',
    'The gamma=0.5 onset is anchored to the Baker-Gollub literature value.',
    '0-1 test samples corroborate regular/chaotic sides without replacing the Floquet criterion.',
    'Every artifact carries parameters, commands, hashes, and caveats.'
  ],
  evidenceArtifacts: [
    'reports/paper-study.json',
    'paper/index.html',
    'paper/paper.pdf',
    'reports/literature-anchors.json',
    'reports/reproduce/manifest.json'
  ],
  caveats: [
    'The comparison fixes omega=2/3 and follows the primary attractor branch; coexisting basins may have different events.',
    'Melnikov theory is first-order in forcing/damping and is not an ordering bound at strong damping.',
    'Chaotic comparisons are bounded by the predictability horizon.'
  ]
};

export const REVIEWER_KIT_ARTIFACTS: readonly ReviewerKitArtifact[] = [
  {
    id: 'flagship-study-json',
    path: 'reports/paper-study.json',
    command: 'npm run paper:study',
    priority: 'required',
    description: 'Numerical source of truth for the flagship Melnikov gap map.'
  },
  {
    id: 'flagship-certification',
    path: 'reports/flagship-certification.json',
    command: 'npm run flagship:certify',
    priority: 'required',
    description: 'Figure 1 hash, crossing interval, onset localization table, and caveat map.'
  },
  {
    id: 'flagship-figure-1',
    path: 'reports/flagship-figure1.svg',
    command: 'npm run flagship:certify',
    priority: 'recommended',
    description: 'Reviewer-facing Figure 1 SVG for the Melnikov gap map.'
  },
  {
    id: 'flagship-external-check',
    path: 'reports/flagship-external-check.json',
    command: 'npm run flagship:external',
    priority: 'recommended',
    description: 'Dependency-free Python recomputation of A_c and the ratio crossing from exported A_PD values.'
  },
  {
    id: 'flagship-paper-html',
    path: 'paper/index.html',
    command: 'npm run paper:build',
    priority: 'required',
    description: 'Self-contained paper with figures rendered from the study JSON.'
  },
  {
    id: 'flagship-paper-pdf',
    path: 'paper/paper.pdf',
    command: 'npm run paper:build',
    priority: 'recommended',
    description: 'Print-reviewable PDF generated from the same HTML paper.'
  },
  {
    id: 'one-command-manifest',
    path: 'reports/reproduce/manifest.json',
    command: 'npm run reproduce',
    priority: 'required',
    description: 'Hash-stamped deterministic manifest for headline claims.'
  },
  {
    id: 'external-cross-validation',
    path: 'reports/cross-validation.json',
    command: 'npm run validate:cross',
    priority: 'recommended',
    description: 'Independent SciPy DOP853 trajectory comparison.'
  },
  {
    id: 'symbolic-validation',
    path: 'reports/sympy-validation.json',
    command: 'npm run validate:sympy',
    priority: 'recommended',
    description: 'Independent SymPy Euler-Lagrange RHS derivation check.'
  },
  {
    id: 'notebook',
    path: 'reports/research-notebook.html',
    command: 'npm run notebook',
    priority: 'optional',
    description: 'Figure-rich notebook driven through the same analysis handlers.'
  },
  {
    id: 'gpu-scale-contract',
    path: 'reports/gpu-scale-validation.md',
    command: 'npm run validate:gpu-scale',
    priority: 'recommended',
    description: 'CPU reference plus mocked-WebGPU contract for accelerated field/ensemble paths.'
  },
  {
    id: 'webgpu-hardware-validation',
    path: 'reports/webgpu-hardware-validation.md',
    command: 'npm run validate:webgpu-hardware',
    priority: 'recommended',
    description: 'Real-adapter WebGPU reduction comparison against the CPU f64 oracle.'
  },
  {
    id: 'gpu-benchmark-ladder',
    path: 'reports/gpu-benchmark-ladder.md',
    command: 'npm run benchmark:gpu-ladder',
    priority: 'recommended',
    description: 'Real-adapter GPU ladder with adapter metadata, f32/f64 horizon drift, and CLV/FTLE promotion metrics.'
  },
  {
    id: 'release-readiness',
    path: 'reports/release-readiness.json',
    command: 'npm run release:package',
    priority: 'required',
    description: 'Machine-readable DOI/Pages/npm/PDF/GIF release readiness manifest.'
  },
  {
    id: 'release-one-page-pdf',
    path: 'reports/release-one-page.pdf',
    command: 'npm run release:package',
    priority: 'recommended',
    description: 'One-page reviewer handout for release notes and external review.'
  },
  {
    id: 'walkthrough-gif',
    path: 'reports/walkthrough-30s.gif',
    command: 'npm run release:package',
    priority: 'recommended',
    description: 'Thirty-second walkthrough artifact for the GitHub release and project page.'
  },
  {
    id: 'memory-regression-report',
    path: 'reports/memory-regression-report.md',
    command: 'npm run benchmark:memory',
    priority: 'required',
    description: 'Browser memory regression report for the current build.'
  },
  {
    id: 'memory-baseline',
    path: 'reports/memory-baseline.json',
    command: 'npm run benchmark:memory',
    priority: 'required',
    description: 'Machine-readable browser memory baseline consumed by the world-class audit.'
  },
  {
    id: 'reviewer-kit-manifest',
    path: 'reports/reviewer-kit-manifest.json',
    command: 'npm run reviewer:kit',
    priority: 'required',
    description: 'Machine-readable checklist of the reviewer kit itself.'
  }
] as const;

export const GPU_SCALE_VALIDATION_CONTRACTS: readonly GpuScaleValidationContract[] = [
  {
    id: 'ensemble-rk4',
    cpuReference: 'src/runtime/gpuEnsemble.ts CPU f64 RK4 path',
    acceleratedPath: 'WGSL RK4 ensemble kernel in src/runtime/gpuEnsemble.ts',
    acceptanceRule: 'GPU integration may feed research outputs only through validated statistics; CPU force path remains the trajectory oracle.',
    ciEvidence: ['tests/gpu-ensemble.test.ts', 'tests/ensemble-statistics.test.ts'],
    caveat: 'Node CI has no real adapter; hardware WebGPU runs must still report backend=webgpu and caveat=f32.'
  },
  {
    id: 'ensemble-reduction-oracle',
    cpuReference: 'ensembleStatistics CPU f64 mean/covariance/rms/flip reduction',
    acceleratedPath: 'webgpuEnsembleStatistics GPU reduction or f32 candidate reduction',
    acceptanceRule: 'compareEnsembleStatistics(candidate, cpuOracle) must pass declared tolerances before a reduction can be used as a publication result.',
    ciEvidence: ['tests/ensemble-statistics.test.ts', 'scripts/gpu-scale-validation.ts'],
    caveat: 'The local CI candidate is f32-rounded CPU output; the self-hosted hardware workflow runs the on-device reduction when a WebGPU adapter is present.'
  },
  {
    id: 'field-scans',
    cpuReference: 'f64 probe-cell recomputation in src/runtime/gpuFields.ts',
    acceleratedPath: 'WGSL flip-basin / sweep / FTLE field kernels',
    acceptanceRule: 'GPU output is accepted only when deterministic CPU probe validation passes; otherwise the f64 CPU grid is returned.',
    ciEvidence: ['tests/gpu-fields-validation.test.ts', 'tests/gpu-fields.test.ts'],
    caveat: 'Fractal basin boundaries allow isolated probe disagreements; the gate is on disagreement fraction.'
  },
  {
    id: 'chaos-acceleration-contract',
    cpuReference: 'existing CPU CLV/full-spectrum/variational FTLE implementations',
    acceleratedPath: 'src/runtime/gpuLyapunov.ts full-spectrum candidate plus src/runtime/gpuChaosPromotion.ts CLV and variational-FTLE candidates',
    acceptanceRule: 'GPU candidates must pass compareClvAcceleration / compareFtleFieldAcceleration / compareLyapunovSpectrumAcceleration against the CPU oracle before promotion.',
    ciEvidence: ['tests/clv.test.ts', 'tests/ftle.test.ts', 'tests/lyapunov-spectrum-job.test.ts', 'tests/acceleration-contract.test.ts', 'e2e/webgpu-hardware-reductions.spec.ts'],
    caveat: 'The 4D double-pendulum full-spectrum, CLV, and variational-FTLE WebGPU candidates are hardware-gated against CPU f64 oracles; broader N-chain GPU promotion remains a separate scope.'
  }
] as const;

export function evaluateReviewerKit(available: (path: string) => boolean): ReviewerKitEvaluation {
  const ready: ReviewerKitArtifact[] = [];
  const missingRequired: ReviewerKitArtifact[] = [];
  const missingRecommended: ReviewerKitArtifact[] = [];
  const missingOptional: ReviewerKitArtifact[] = [];
  for (const artifact of REVIEWER_KIT_ARTIFACTS) {
    if (available(artifact.path)) {
      ready.push(artifact);
    } else if (artifact.priority === 'required') {
      missingRequired.push(artifact);
    } else if (artifact.priority === 'recommended') {
      missingRecommended.push(artifact);
    } else {
      missingOptional.push(artifact);
    }
  }
  return {
    status: missingRequired.length ? 'missing-required' : missingRecommended.length ? 'missing-recommended' : 'ready',
    ready,
    missingRequired,
    missingRecommended,
    missingOptional
  };
}

export function reviewerKitCommands(evaluation: ReviewerKitEvaluation): string[] {
  const missing = [...evaluation.missingRequired, ...evaluation.missingRecommended];
  return [...new Set(missing.map((artifact) => artifact.command))];
}

export function flagshipMarkdown(flagship: FlagshipResult = CERTIFIED_WORKBENCH_FLAGSHIP): string {
  return [
    `# ${flagship.title}`,
    '',
    `**Thesis.** ${flagship.thesis}`,
    '',
    `**Primary metric.** ${flagship.primaryMetric}`,
    '',
    `Reproduce the study with \`${flagship.flagshipCommand}\`, then render the paper with \`${flagship.paperCommand}\`.`,
    '',
    '## Trust Contract',
    ...flagship.trustContract.map((item) => `- ${item}`),
    '',
    '## Evidence Artifacts',
    ...flagship.evidenceArtifacts.map((artifact) => `- \`${artifact}\``),
    '',
    '## Caveats',
    ...flagship.caveats.map((caveat) => `- ${caveat}`),
    ''
  ].join('\n');
}
