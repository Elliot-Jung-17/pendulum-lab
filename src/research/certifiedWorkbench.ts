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
    acceptanceRule: 'Final ensemble statistics must be consumed with the f32 caveat; CPU force path remains the oracle.',
    ciEvidence: ['tests/gpu-ensemble.test.ts', 'tests/ensemble-statistics.test.ts'],
    caveat: 'Node CI has no real adapter; hardware WebGPU runs must still report backend=webgpu and caveat=f32.'
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
    id: 'future-clv-ftle-scale',
    cpuReference: 'existing CPU CLV/full-spectrum/variational FTLE implementations',
    acceleratedPath: 'not promoted until GPU and CPU agree under the same public result schema',
    acceptanceRule: 'No GPU-only scientific claim may be publication-ready without CPU reference agreement and a Trust Inspector caveat.',
    ciEvidence: ['tests/clv.test.ts', 'tests/ftle.test.ts', 'tests/lyapunov-spectrum-job.test.ts'],
    caveat: 'This is an explicit promotion rule, not an implemented accelerator.'
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
