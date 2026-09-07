/** S01 semantic interpretation of existing implementations, not the S02 product registry. */
export interface CapabilitySeed {
  id: string;
  category:
    'system' | 'analysis' | 'integrator' | 'control' | 'importer' | 'exporter' | 'storage-schema' | 'route' | 'runtime';
  label: string;
  ownerFile: string;
  symbol: string;
  futureStage: number;
  note?: string;
}

type SeedRow = [string, string, string, string, number, string?];
function rows(category: CapabilitySeed['category'], entries: SeedRow[]): CapabilitySeed[] {
  return entries.map(([id, label, ownerFile, symbol, futureStage, note]) => ({
    id: `${category}:${id}`,
    category,
    label,
    ownerFile,
    symbol,
    futureStage,
    ...(note ? { note } : {})
  }));
}

export const capabilitySeeds: CapabilitySeed[] = [
  ...rows('system', [
    ['double', 'Point-mass double pendulum', 'src/physics/double.ts', 'rhsDouble', 7],
    [
      'compound-double',
      'Uniform-rod compound double pendulum',
      'src/physics/compoundDouble.ts',
      'rhsCompoundDouble',
      7
    ],
    ['triple', 'Triple pendulum', 'src/physics/triple.ts', 'rhsTriple', 10],
    ['chain', 'Variable-length planar pendulum chain', 'src/physics/nPendulum.ts', 'rhsChain', 10],
    ['spring', 'Spring pendulum with radial motion', 'src/physics/spring.ts', 'rhsSpring', 11],
    ['rope', 'Unilateral rope pendulum', 'src/physics/rope.ts', 'RopePendulum', 11],
    ['double-string', 'Unilateral double-string pendulum', 'src/physics/doubleString.ts', 'DoubleStringPendulum', 11],
    ['spherical', 'Angular-coordinate spherical pendulum', 'src/physics/spherical.ts', 'SphericalPendulum', 12],
    ['spherical-chain', 'Angular-coordinate spherical chain', 'src/physics/sphericalChain.ts', 'SphericalChain', 12],
    [
      'spherical-embedded',
      'Embedded constrained spherical pendulum',
      'src/physics/sphericalEmbedded.ts',
      'EmbeddedSphericalPendulum',
      12
    ],
    [
      'spherical-embedded-chain',
      'Embedded constrained spherical chain',
      'src/physics/sphericalEmbeddedChain.ts',
      'EmbeddedSphericalChain',
      12
    ],
    ['driven', 'Damped and periodically driven pendulum', 'src/physics/driven.ts', 'rhsDriven', 13],
    [
      'coupled',
      'Coupled pendulums expansion model',
      'src/physics/expandedModels-factory.ts',
      'EXPANSION_MODEL_DEFINITIONS',
      13
    ],
    [
      'inverted',
      'Open-loop inverted pendulum expansion model',
      'src/physics/expandedModels-factory.ts',
      'EXPANSION_MODEL_DEFINITIONS',
      13
    ],
    [
      'cartpole',
      'Open-loop cart-pole expansion model',
      'src/physics/expandedModels-factory.ts',
      'EXPANSION_MODEL_DEFINITIONS',
      13,
      'Existing model applies constant open-loop force; a feedback controller is not claimed.'
    ],
    [
      'parametric',
      'Parametrically excited expansion pendulum',
      'src/physics/expandedModels-factory.ts',
      'EXPANSION_MODEL_DEFINITIONS',
      13
    ],
    ['duffing', 'Duffing oscillator', 'src/physics/duffing.ts', 'rhsDuffing', 14],
    ['van-der-pol', 'Van der Pol oscillator', 'src/physics/vanDerPol.ts', 'rhsVanDerPol', 14],
    ['kapitza', 'Kapitza pendulum', 'src/physics/kapitza.ts', 'rhsKapitza', 14],
    ['mathieu', 'Linear Mathieu stability model', 'src/chaos/mathieuStability.ts', 'mathieuStabilityDiagram', 14],
    ['friction', 'Coulomb and Stribeck friction dynamics', 'src/physics/friction.ts', 'applyStribeckFriction', 14],
    ['pyragas', 'Pyragas delayed-feedback trajectory', 'src/physics/pyragasDde.ts', 'integratePyragasPendulumDde', 14],
    ['magnetic', 'Multi-magnet pendulum', 'src/physics/magneticPendulum.ts', 'rhsMagneticPendulum', 15],
    ['pendulum-network', 'Coupled pendulum graph', 'src/physics/pendulumNetwork.ts', 'rhsPendulumNetwork', 15],
    ['kuramoto', 'Kuramoto phase oscillator network', 'src/physics/kuramoto.ts', 'rhsKuramoto', 15],
    [
      'huygens-phase-pair',
      'Huygens two-clock phase reduction',
      'src/physics/kuramoto.ts',
      'rhsHuygensPhasePair',
      15,
      'Phase reduction only; no mechanical escapement/contact model.'
    ],
    [
      'chimera-exploration',
      'Chimera-seeded nonlocal Kuramoto exploration',
      'src/app/researchPlusModels.ts',
      'buildSynchronizationExploration',
      15,
      'Reuses Kuramoto dynamics and chimera diagnostics, not an independent engine.'
    ],
    ['langevin', 'Seeded Langevin paths and ensembles', 'src/physics/stochastic.ts', 'runLangevinEnsemble', 16],
    ['fput', 'FPUT nonlinear chain', 'src/physics/fput.ts', 'fputAcceleration', 16],
    [
      'lattice-fk-limit',
      'Pendulum lattice / harmonic Frenkel-Kontorova limit',
      'src/physics/pendulumNetwork.ts',
      'ringPhononDispersion',
      16,
      'Existing nearest-neighbour pendulum network and harmonic dispersion; not a claim of a separate general FK depinning solver.'
    ],
    ['sine-gordon', 'Sine-Gordon field', 'src/physics/sineGordon.ts', 'createSineGordonField', 16],
    ['standard-map', 'Standard map iteration', 'src/physics/standardMap.ts', 'standardMapStep', 17],
    ['quantum-kicked-rotor', 'Quantum kicked rotor', 'src/physics/quantumKickedRotor.ts', 'createQkrState', 17],
    [
      'unitary-floquet',
      'Unitary Floquet spectral evolution',
      'src/research/unitaryFloquet.ts',
      'complexUnitaryFloquetSpectrum',
      17
    ]
  ]),
  ...rows('analysis', [
    ['energy', 'Energy, drift and dissipated work', 'src/physics/energy.ts', 'relativeEnergyDrift', 18],
    ['fft', 'Fourier spectrum', 'src/physics/fft.ts', 'fftInPlace', 18],
    ['naff', 'NAFF frequency extraction', 'src/chaos/naff.ts', 'naffDecompose', 18],
    ['poincare', 'Poincare sections and return maps', 'src/chaos/poincare.ts', 'poincareSection', 18],
    ['lyapunov', 'Maximal and full Lyapunov spectrum', 'src/chaos/lyapunov.ts', 'maximalLyapunov', 18],
    ['sali-fli', 'SALI and FLI indicators', 'src/chaos/indicators.ts', 'sali', 18],
    ['zero-one', '0-1 chaos test', 'src/chaos/zeroOneTest.ts', 'zeroOneTest', 18],
    ['shadowing', 'Shadowing reliability', 'src/chaos/shadowing.ts', 'shadowingHorizon', 18],
    ['rqa', 'Recurrence quantification and uncertainty', 'src/chaos/rqa.ts', 'recurrenceQuantification', 19],
    [
      'recurrence-network',
      'Recurrence graph geometry',
      'src/chaos/recurrenceNetwork.ts',
      'recurrenceNetworkMetrics',
      19
    ],
    ['correlation-dimension', 'Correlation dimension', 'src/chaos/correlationDimension.ts', 'correlationDimension', 19],
    ['multifractal', 'Multifractal spectrum', 'src/chaos/multifractal.ts', 'generalizedDimensions', 19],
    ['topological-entropy', 'Topological entropy', 'src/chaos/topologicalEntropy.ts', 'topologicalEntropy1D', 19],
    [
      'transfer-operator',
      'Transfer operator spectrum and transport',
      'src/chaos/transferOperator.ts',
      'transferOperatorSpectrum',
      19
    ],
    ['clv', 'Covariant Lyapunov vectors', 'src/chaos/clv.ts', 'covariantLyapunovVectors', 19],
    ['ftle', 'Finite-time Lyapunov fields', 'src/chaos/ftle.ts', 'finiteTimeLyapunov', 19],
    ['lcs-ridge', 'FTLE ridges and LCS candidates', 'src/chaos/ftleRidge.ts', 'extractFtleRidges', 19],
    ['basin', 'Basins, entropy, boundary dimension and uncertainty', 'src/chaos/basin.ts', 'basinEntropy', 19],
    ['wada', 'Wada resolution convergence', 'src/chaos/wadaConvergence.ts', 'wadaResolutionConvergence', 19],
    ['fixed-point', 'Fixed-point linear classification', 'src/chaos/fixedPointClassify.ts', 'classifyFixedPoint', 20],
    [
      'periodic-orbits',
      'Periodic orbit shooting and database',
      'src/chaos/periodicOrbitDatabase.ts',
      'buildPeriodicOrbitDatabase',
      20
    ],
    ['floquet', 'Floquet multipliers', 'src/chaos/floquet.ts', 'floquetAnalysis', 20],
    [
      'floquet-linear',
      'Linear time-periodic Floquet propagator',
      'src/chaos/floquetLinear.ts',
      'floquetLinearSpectrum',
      20
    ],
    ['melnikov', 'Melnikov separatrix splitting', 'src/chaos/melnikov.ts', 'melnikovFunction', 20],
    ['continuation', 'Natural-parameter continuation', 'src/chaos/continuation.ts', 'continueDrivenPeriodicOrbit', 20],
    ['arclength', 'Pseudo-arclength continuation', 'src/chaos/arclength.ts', 'continueArclength', 20],
    ['branch-switch', 'Branch switching', 'src/chaos/branchSwitching.ts', 'switchPeriodDoubling', 20],
    ['bifurcation-detection', 'Bifurcation detection', 'src/chaos/bifurcationDetect.ts', 'detectBifurcations', 20],
    [
      'neimark-sacker',
      'Neimark-Sacker stability and branch following',
      'src/chaos/neimarkSacker.ts',
      'detectNeimarkSacker',
      20
    ],
    ['torus', 'Torus winding and locking diagnostics', 'src/chaos/torusAnalysis.ts', 'torusLyapunovSpectrum', 20],
    ['arnold-tongue', 'Arnold tongue parameter maps', 'src/chaos/arnoldTongue.ts', 'scanModeLocking', 20],
    ['codimension-two', 'Codimension-two bifurcation maps', 'src/chaos/codimTwo.ts', 'codimTwoDiagram', 20],
    ['chimera', 'Local coherence and chimera classification', 'src/chaos/chimera.ts', 'chimeraDiagnostics', 15],
    [
      'lattice-dispersion',
      'Diatomic lattice bands and group velocity',
      'src/physics/latticeDispersion.ts',
      'diatomicDispersion',
      16
    ],
    [
      'fk-kink-pinning',
      'Static Frenkel-Kontorova kink relaxation and Peierls-Nabarro barrier',
      'src/physics/sineGordon.ts',
      'peierlsNabarroBarrier',
      16,
      'Static discrete-kink energy/relaxation and pinning barrier tools; not a general driven depinning solver.'
    ],
    ['kramers', 'Kramers escape-rate diagnostics', 'src/physics/kramersEscape.ts', 'arrheniusMTTF', 16],
    [
      'stochastic-resonance',
      'Stochastic resonance diagnostics',
      'src/physics/stochasticResonance.ts',
      'stochasticResonanceCurve',
      16
    ],
    [
      'experiment-design',
      'Sweep, ensemble and experimental design',
      'src/research/experimentDesign.ts',
      'latinHypercube',
      21
    ],
    [
      'integrator-comparison',
      'Expansion integrator and parameter comparison',
      'src/physics/expandedModels-runners.ts',
      'runExpansionSuite',
      21
    ],
    [
      'parameter-estimation',
      'Parameter estimation and uncertainty',
      'src/research/parameterEstimation.ts',
      'fitDoublePendulum',
      22
    ],
    ['sobol', 'Sobol variance sensitivity', 'src/research/sobolSensitivity.ts', 'sobolIndices', 22],
    ['pce-surrogate', 'Polynomial chaos surrogate regression', 'src/research/surrogate.ts', 'fitPolynomialChaos', 22],
    ['sindy', 'Sparse dynamical identification', 'src/research/sindy.ts', 'identifyDynamics', 23],
    ['dmd', 'Dynamic mode decomposition', 'src/research/dmd.ts', 'dynamicModeDecomposition', 23],
    ['havok', 'HAVOK embedding and forcing', 'src/research/havok.ts', 'havokAnalysis', 23],
    ['reservoir', 'Reservoir model learning', 'src/research/reservoir.ts', 'trainEsn', 23],
    [
      'hamiltonian-learning',
      'Hamiltonian learning and rollout',
      'src/research/hamiltonianLearning.ts',
      'learnHamiltonian',
      23
    ],
    ['arnoldi', 'Arnoldi Krylov eigenanalysis', 'src/research/arnoldi.ts', 'restartedArnoldi', 23],
    ['lanczos', 'Lanczos Krylov eigenanalysis', 'src/research/lanczos.ts', 'restartedLanczos', 23],
    [
      'general-eigensolver',
      'General and complex eigenanalysis',
      'src/research/eigenGeneral.ts',
      'eigenvaluesGeneral',
      23
    ],
    [
      'structure-validation',
      'Convergence and structure-preservation checks',
      'src/research/structurePreservation.ts',
      'energyDriftProfile',
      21
    ]
  ]),
  ...rows('integrator', [
    [
      'adaptive-controller',
      'Accepted/rejected adaptive integration and replay',
      'src/physics/adaptive.ts',
      'integrateAdaptive',
      7
    ],
    ['canonical', 'Canonical-coordinate symplectic integration', 'src/physics/canonical.ts', 'canonicalRhs', 7],
    ['sde-additive', 'Euler-Maruyama and additive noise', 'src/physics/stochasticAdditive.ts', 'eulerMaruyamaStep', 16],
    [
      'sde-multiplicative',
      'Scalar Milstein multiplicative noise',
      'src/physics/stochasticMultiplicative.ts',
      'milsteinStep',
      16
    ],
    [
      'sde-matrix',
      'Commutative Milstein and Stratonovich Heun',
      'src/physics/stochasticMatrixNoise.ts',
      'commutativeMilsteinStep',
      16
    ]
  ]),
  ...rows('control', [
    [
      'forcing-and-feedback',
      'Delayed and chaos-control feedback',
      'src/chaos/chaosControl.ts',
      'simulateOgyControl',
      14
    ],
    [
      'physical-parameters',
      'Shared parameter and initial-condition controls',
      'src/app/systemControls.ts',
      'readSystem',
      6
    ],
    ['precision', 'Integrator precision controls', 'src/app/precisionControls.ts', 'installPrecisionControls', 6],
    ['run-and-history', 'Run, replay, recording and step controls', 'src/app/LabControls.ts', 'LabControls', 7],
    ['audio', 'Motion and energy audio sonification', 'src/app/AudioSonifier.ts', 'AudioSonifier', 7],
    [
      'search-and-commands',
      'Command palette and control search',
      'src/app/parity/command-palette.ts',
      'installCommandPalettes',
      6
    ],
    ['locale-and-theme', 'Language, theme and accessibility preferences', 'src/app/uiLocale.ts', 'uiMessage', 5]
  ]),
  ...rows('importer', [
    [
      'observations',
      'CSV and observation data parsing',
      'src/research/experimentalDataImport.ts',
      'parseObservedDoublePendulumCsv',
      22
    ],
    [
      'video',
      'Video marker tracking and calibration',
      'src/browser/videoMarkerCapture.ts',
      'VideoMarkerCaptureController',
      22
    ],
    ['imu', 'IMU sensor observation capture', 'src/browser/imuMotionCapture.ts', 'ImuMotionCaptureController', 22],
    ['saved-run', 'Saved trajectory imports', 'src/browser/savedRunImport.ts', 'parseAndApplySavedRun', 28],
    [
      'workspace',
      'Validated and atomic workspace imports',
      'src/app/parity/workspace-import-transaction.ts',
      'runWorkspaceImportTransaction',
      28
    ]
  ]),
  ...rows('exporter', [
    ['lab', 'Trajectory CSV, figure and experiment export', 'src/app/labExport.ts', 'trajectoryCsv', 7],
    ['figure', 'Publication figure pipeline', 'src/research/figurePipeline.ts', 'renderStudyFigureSvg', 24],
    ['notebook', 'Reproducible notebook generation', 'src/research/notebookBuilder.ts', 'buildNotebookV2', 24],
    ['package', 'Reproduction package and manifest', 'src/research/reproPackage.ts', 'buildReproPackage', 24],
    ['zip', 'ZIP bundle and checksums', 'src/research/zipBundle.ts', 'buildZip', 24]
  ]),
  ...rows('storage-schema', [
    ['session', 'Session state and migration validation', 'src/state/sessionSchema.ts', 'SESSION_SCHEMA_VERSION', 3],
    [
      'workspace',
      'Legacy workspace storage and import shape',
      'src/app/parity/storage-schema.ts',
      'RESEARCH_STORAGE_KEY',
      28
    ],
    ['research-db', 'IndexedDB projects, runs and artifacts', 'src/research/researchDb.ts', 'ResearchDb', 24],
    ['provenance', 'Run and artifact provenance contracts', 'src/research/provenance.ts', 'ProvenanceBuilder', 24]
  ]),
  ...rows('route', [
    ['tabs', 'Legacy tab query and browser history', 'src/app/tabRouting.ts', 'urlForTab', 3],
    ['share', 'Versioned experiment share envelopes', 'src/app/experimentShareCodec.ts', 'encodeSharedExperiment', 3],
    [
      'deep-link',
      'Control deep-link parsing and validation',
      'src/app/deepLinkControls.ts',
      'applyNumericControlParams',
      28
    ]
  ]),
  ...rows('runtime', [
    ['jobs', 'Worker scheduling, progress and cancellation', 'src/workers/JobEngine.ts', 'JobEngine', 21],
    ['gpu', 'GPU acceleration and validated fallback', 'src/runtime/gpuEnsemble.ts', 'runDoublePendulumEnsemble', 21],
    ['wasm', 'Wasm simulation acceleration', 'src/runtime/wasmEnsemble.ts', 'runDoublePendulumEnsembleWasm', 21],
    [
      'public-globals',
      'Stable public scripting namespace and legacy aliases',
      'src/runtime/globalApi.ts',
      'publishPublicApi',
      28
    ]
  ])
];

/** Every module has a migration responsibility; a new unknown source family is a failure. */
export function stageForFile(file: string): number | null {
  const direct = capabilitySeeds.find((item) => item.ownerFile === file);
  if (direct) return direct.futureStage;
  if (/^src\/physics\/(?:stochastic|noiseCommutativity)/.test(file)) return 16;
  if (/^src\/physics\/spherical/.test(file)) return 12;
  if (/^src\/physics\/expandedModels/.test(file)) return 21;
  if (/^src\/physics\//.test(file)) return 7;
  if (/^src\/chaos\/(?:neimark|spectrumConsistency|variational|accelerationContract)/.test(file))
    return /neimark/.test(file) ? 20 : 18;
  if (/^src\/chaos\//.test(file)) return 18;
  if (/^src\/research\/(?:complexEig|svd|trainingProtocol)/.test(file)) return 23;
  if (/^src\/research\//.test(file)) return 24;
  if (/^src\/app\/parity\/(?:storage|workspace-import|research-storage)/.test(file)) return 28;
  if (/^src\/app\/parity\/lab3d/.test(file)) return 12;
  if (/^src\/app\/parity\/(?:research|figure|paper|superpack)/.test(file)) return 24;
  if (/^src\/app\/(?:audience|onboarding|navGuide|rail|Theory|theory|education)/.test(file)) return 29;
  if (/^src\/app\/(?:Pwa|bootstrap|Shell|TabController|index)/.test(file)) return 4;
  if (/^src\/app\/(?:experimentShare|base64Url)/.test(file)) return 3;
  if (/^src\/app\/(?:Research|research|GoldenCenter)/.test(file)) return 24;
  if (/^src\/app\/(?:Basin|Rqa|Clv|Ftle)/.test(file)) return 19;
  if (/^src\/app\/Bifurcation/.test(file)) return 20;
  if (/^src\/app\/(?:Sweep|Compare|Expansion|expansion|ensemble)/.test(file)) return 21;
  if (/^src\/app\//.test(file)) return 7;
  if (/^src\/(?:runtime|worker|workers)\//.test(file)) return 21;
  if (/^src\/(?:browser|export|reviewer)\//.test(file)) return 24;
  if (/^src\/(?:lib\/|lib\.ts|demo\/)/.test(file)) return 2;
  if (/^src\/(?:state|types)\//.test(file)) return 3;
  if (/^src\/(?:ui|viz|render)\//.test(file)) return 5;
  if (/^src\/validation\//.test(file)) return 28;
  if (/^src\/integrations\//.test(file)) return 28;
  if (file === 'src/main.ts') return 4;
  if (/^(?:tests|e2e|data|documents\/examples|documents\/schemas)\//.test(file)) return 28;
  if (/^wasm\//.test(file)) return 21;
  if (
    /^scripts\/(?:research-cli|research-notebook|export-repro|reviewer-kit|paper-|build-paper|reproduce-all)/.test(file)
  )
    return 24;
  if (/^scripts\//.test(file)) return 30;
  if (/^css\//.test(file)) return 5;
  if (/^(?:public\/|app\.html|reviewer\.html|standalone-manifest\.json|vite\.config)/.test(file)) return 29;
  if (/^(?:config\/|jsr\.json|package\.json)/.test(file)) return 28;
  return null;
}
