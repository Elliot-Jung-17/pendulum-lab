# S01 기능 보존 인벤토리

제품 버전: 10.36.0. 원본 집합 SHA-256: `0cd34a3cd01aa7453fc534d75d1f684a580b70de01286b9a8199b6e912f5de08`.

이 문서는 `scripts/redesign/inventory.ts --write`가 생성한다. 기본 실행과 `--check`는 읽기 전용이다. 제품 모듈을 실행하지 않고 TypeScript AST, 타입 검사기의 export 해석, 파일 내용을 조사한다.

## 범위와 해석

- `capabilities`는 소유 선언을 직접 지정한 의미 단위다. 여러 알고리즘을 한 기능으로 묶기도 하며, 서로 다른 표현/사용 경로를 분리하기도 한다. 기능 수를 시스템 registry 개수와 혼동하지 않는다.
- `facts`는 모든 소스 모듈, export 선언, 공개 API, literal 제어/URL/schema, registry 항목, worker 메시지, preset, 기존 테스트와 fixture 자산의 기계 관찰이다. 함수 하나나 파일 하나가 사용자 기능 하나라는 주장이 아니다.
- 각 항목의 ownerFile/line은 기존 구현 근거이며 futureStage는 재설계 연결 책임이다. 모든 기존 항목은 최종 S28 동등성 심사 대상이다. stage 지정은 새 기능 구현이나 동등성 통과를 의미하지 않는다.
- src 전체(단수 worker 및 wasm 포함), 기존 CLI/검증 scripts, wasm 원본, CSS/PWA, 기존 HTML, 패키지/빌드/설정, tests/e2e의 데이터와 이미지, 실험 데이터 및 문서 예제/schema를 포함한다. S01 자체의 scripts/redesign, tests/characterization과 e2e/redesign은 순환 snapshot 방지를 위해 제외한다. package.json은 redesign:* 실행 별칭만 제외하고 기존 CLI 명령/API/의존성 manifest를 hash한다.
- assignment=semantic-owner는 명시적 기능의 소유 파일이며 module-family는 검토된 기존 디렉터리/파일 패턴의 연결 책임 배정이다. 후자는 개별 사용자 기능을 의미론적으로 검토했다는 표시가 아니다. 두 수를 분리해 보고하며 알려지지 않은 src 디렉터리는 실패한다.
- 동적으로 조립한 control ID, URL, 외부 모듈명은 literal 목록만으로 완전 증명할 수 없다. 전체 모듈/공개 선언 소유권과 기존 런타임 테스트를 보조 증거로 보존한다. 네트워크 주소와 사용자 데이터는 읽지 않는다.
- 정적/리터럴 동적 relative import, type import, new URL 자산과 named binding을 검사한다. 생성된 dist, reports의 과거 측정값, node_modules, 배포 산출물은 제품 원본 인벤토리에 중복 포함하지 않는다.

## 자동 검사

| 항목 | 개수 |
|---|---:|
| files | 883 |
| filesWithSemanticOwner | 112 |
| filesWithModuleFamilyAssignment | 771 |
| semanticCapabilities | 118 |
| facts | 6825 |
| relativeImports | 2548 |
| brokenImports | 0 |
| orphans | 0 |
| unresolvedDynamicImports | 12 |
| capability:system | 34 |
| capability:analysis | 51 |
| capability:integrator | 5 |
| capability:control | 7 |
| capability:importer | 5 |
| capability:exporter | 5 |
| capability:storage-schema | 4 |
| capability:route | 3 |
| capability:runtime | 4 |
| fact:test-module | 282 |
| fact:source-module | 531 |
| fact:worker | 7 |
| fact:exported-declaration | 2529 |
| fact:control | 433 |
| fact:public-global | 8 |
| fact:storage-schema | 78 |
| fact:worker-message | 62 |
| fact:route-parameter | 27 |
| fact:preset | 19 |
| fact:system-registration | 22 |
| fact:integrator | 16 |
| fact:asset | 70 |
| fact:route | 25 |
| fact:fixture | 29 |
| fact:cli-command | 104 |
| fact:public-entrypoint | 8 |
| fact:public-api | 2575 |

## 의미 단위와 연결 책임

| ID | 기능 | 구현 소유 선언 | 단계 | 현재 제한 |
|---|---|---|---:|---|
| analysis:arclength | Pseudo-arclength continuation | [src/chaos/arclength.ts:135](../../../src/chaos/arclength.ts) — Declaration continueArclength | S20 |  |
| analysis:arnold-tongue | Arnold tongue parameter maps | [src/chaos/arnoldTongue.ts:147](../../../src/chaos/arnoldTongue.ts) — Declaration scanModeLocking | S20 |  |
| analysis:arnoldi | Arnoldi Krylov eigenanalysis | [src/research/arnoldi.ts:164](../../../src/research/arnoldi.ts) — Declaration restartedArnoldi | S23 |  |
| analysis:basin | Basins, entropy, boundary dimension and uncertainty | [src/chaos/basin.ts:53](../../../src/chaos/basin.ts) — Declaration basinEntropy | S19 |  |
| analysis:bifurcation-detection | Bifurcation detection | [src/chaos/bifurcationDetect.ts:54](../../../src/chaos/bifurcationDetect.ts) — Declaration detectBifurcations | S20 |  |
| analysis:branch-switch | Branch switching | [src/chaos/branchSwitching.ts:185](../../../src/chaos/branchSwitching.ts) — Declaration switchPeriodDoubling | S20 |  |
| analysis:chimera | Local coherence and chimera classification | [src/chaos/chimera.ts:30](../../../src/chaos/chimera.ts) — Declaration chimeraDiagnostics | S15 |  |
| analysis:clv | Covariant Lyapunov vectors | [src/chaos/clv.ts:224](../../../src/chaos/clv.ts) — Declaration covariantLyapunovVectors | S19 |  |
| analysis:codimension-two | Codimension-two bifurcation maps | [src/chaos/codimTwo.ts:57](../../../src/chaos/codimTwo.ts) — Declaration codimTwoDiagram | S20 |  |
| analysis:continuation | Natural-parameter continuation | [src/chaos/continuation.ts:78](../../../src/chaos/continuation.ts) — Declaration continueDrivenPeriodicOrbit | S20 |  |
| analysis:correlation-dimension | Correlation dimension | [src/chaos/correlationDimension.ts:92](../../../src/chaos/correlationDimension.ts) — Declaration correlationDimension | S19 |  |
| analysis:dmd | Dynamic mode decomposition | [src/research/dmd.ts:168](../../../src/research/dmd.ts) — Declaration dynamicModeDecomposition | S23 |  |
| analysis:energy | Energy, drift and dissipated work | [src/physics/energy.ts:48](../../../src/physics/energy.ts) — Declaration relativeEnergyDrift | S18 |  |
| analysis:experiment-design | Sweep, ensemble and experimental design | [src/research/experimentDesign.ts:119](../../../src/research/experimentDesign.ts) — Declaration latinHypercube | S21 |  |
| analysis:fft | Fourier spectrum | [src/physics/fft.ts:82](../../../src/physics/fft.ts) — Declaration fftInPlace | S18 |  |
| analysis:fixed-point | Fixed-point linear classification | [src/chaos/fixedPointClassify.ts:37](../../../src/chaos/fixedPointClassify.ts) — Declaration classifyFixedPoint | S20 |  |
| analysis:fk-kink-pinning | Static Frenkel-Kontorova kink relaxation and Peierls-Nabarro barrier | [src/physics/sineGordon.ts:509](../../../src/physics/sineGordon.ts) — Declaration peierlsNabarroBarrier | S16 | Static discrete-kink energy/relaxation and pinning barrier tools; not a general driven depinning solver. |
| analysis:floquet | Floquet multipliers | [src/chaos/floquet.ts:188](../../../src/chaos/floquet.ts) — Declaration floquetAnalysis | S20 |  |
| analysis:floquet-linear | Linear time-periodic Floquet propagator | [src/chaos/floquetLinear.ts:175](../../../src/chaos/floquetLinear.ts) — Declaration floquetLinearSpectrum | S20 |  |
| analysis:ftle | Finite-time Lyapunov fields | [src/chaos/ftle.ts:180](../../../src/chaos/ftle.ts) — Declaration finiteTimeLyapunov | S19 |  |
| analysis:general-eigensolver | General and complex eigenanalysis | [src/research/eigenGeneral.ts:302](../../../src/research/eigenGeneral.ts) — Declaration eigenvaluesGeneral | S23 |  |
| analysis:hamiltonian-learning | Hamiltonian learning and rollout | [src/research/hamiltonianLearning.ts:184](../../../src/research/hamiltonianLearning.ts) — Declaration learnHamiltonian | S23 |  |
| analysis:havok | HAVOK embedding and forcing | [src/research/havok.ts:97](../../../src/research/havok.ts) — Declaration havokAnalysis | S23 |  |
| analysis:integrator-comparison | Expansion integrator and parameter comparison | [src/physics/expandedModels-runners.ts:381](../../../src/physics/expandedModels-runners.ts) — Declaration runExpansionSuite | S21 |  |
| analysis:kramers | Kramers escape-rate diagnostics | [src/physics/kramersEscape.ts:90](../../../src/physics/kramersEscape.ts) — Declaration arrheniusMTTF | S16 |  |
| analysis:lanczos | Lanczos Krylov eigenanalysis | [src/research/lanczos.ts:122](../../../src/research/lanczos.ts) — Declaration restartedLanczos | S23 |  |
| analysis:lattice-dispersion | Diatomic lattice bands and group velocity | [src/physics/latticeDispersion.ts:46](../../../src/physics/latticeDispersion.ts) — Declaration diatomicDispersion | S16 |  |
| analysis:lcs-ridge | FTLE ridges and LCS candidates | [src/chaos/ftleRidge.ts:28](../../../src/chaos/ftleRidge.ts) — Declaration extractFtleRidges | S19 |  |
| analysis:lyapunov | Maximal and full Lyapunov spectrum | [src/chaos/lyapunov.ts:311](../../../src/chaos/lyapunov.ts) — Declaration maximalLyapunov | S18 |  |
| analysis:melnikov | Melnikov separatrix splitting | [src/chaos/melnikov.ts:70](../../../src/chaos/melnikov.ts) — Declaration melnikovFunction | S20 |  |
| analysis:multifractal | Multifractal spectrum | [src/chaos/multifractal.ts:114](../../../src/chaos/multifractal.ts) — Declaration generalizedDimensions | S19 |  |
| analysis:naff | NAFF frequency extraction | [src/chaos/naff.ts:97](../../../src/chaos/naff.ts) — Declaration naffDecompose | S18 |  |
| analysis:neimark-sacker | Neimark-Sacker stability and branch following | [src/chaos/neimarkSacker.ts:54](../../../src/chaos/neimarkSacker.ts) — Declaration detectNeimarkSacker | S20 |  |
| analysis:parameter-estimation | Parameter estimation and uncertainty | [src/research/parameterEstimation.ts:482](../../../src/research/parameterEstimation.ts) — Declaration fitDoublePendulum | S22 |  |
| analysis:pce-surrogate | Polynomial chaos surrogate regression | [src/research/surrogate.ts:135](../../../src/research/surrogate.ts) — Declaration fitPolynomialChaos | S22 |  |
| analysis:periodic-orbits | Periodic orbit shooting and database | [src/chaos/periodicOrbitDatabase.ts:135](../../../src/chaos/periodicOrbitDatabase.ts) — Declaration buildPeriodicOrbitDatabase | S20 |  |
| analysis:poincare | Poincare sections and return maps | [src/chaos/poincare.ts:150](../../../src/chaos/poincare.ts) — Declaration poincareSection | S18 |  |
| analysis:recurrence-network | Recurrence graph geometry | [src/chaos/recurrenceNetwork.ts:29](../../../src/chaos/recurrenceNetwork.ts) — Declaration recurrenceNetworkMetrics | S19 |  |
| analysis:reservoir | Reservoir model learning | [src/research/reservoir.ts:189](../../../src/research/reservoir.ts) — Declaration trainEsn | S23 |  |
| analysis:rqa | Recurrence quantification and uncertainty | [src/chaos/rqa.ts:220](../../../src/chaos/rqa.ts) — Declaration recurrenceQuantification | S19 |  |
| analysis:sali-fli | SALI and FLI indicators | [src/chaos/indicators.ts:96](../../../src/chaos/indicators.ts) — Declaration sali | S18 |  |
| analysis:shadowing | Shadowing reliability | [src/chaos/shadowing.ts:98](../../../src/chaos/shadowing.ts) — Declaration shadowingHorizon | S18 |  |
| analysis:sindy | Sparse dynamical identification | [src/research/sindy.ts:245](../../../src/research/sindy.ts) — Declaration identifyDynamics | S23 |  |
| analysis:sobol | Sobol variance sensitivity | [src/research/sobolSensitivity.ts:59](../../../src/research/sobolSensitivity.ts) — Declaration sobolIndices | S22 |  |
| analysis:stochastic-resonance | Stochastic resonance diagnostics | [src/physics/stochasticResonance.ts:222](../../../src/physics/stochasticResonance.ts) — Declaration stochasticResonanceCurve | S16 |  |
| analysis:structure-validation | Convergence and structure-preservation checks | [src/research/structurePreservation.ts:95](../../../src/research/structurePreservation.ts) — Declaration energyDriftProfile | S21 |  |
| analysis:topological-entropy | Topological entropy | [src/chaos/topologicalEntropy.ts:200](../../../src/chaos/topologicalEntropy.ts) — Declaration topologicalEntropy1D | S19 |  |
| analysis:torus | Torus winding and locking diagnostics | [src/chaos/torusAnalysis.ts:88](../../../src/chaos/torusAnalysis.ts) — Declaration torusLyapunovSpectrum | S20 |  |
| analysis:transfer-operator | Transfer operator spectrum and transport | [src/chaos/transferOperator.ts:159](../../../src/chaos/transferOperator.ts) — Declaration transferOperatorSpectrum | S19 |  |
| analysis:wada | Wada resolution convergence | [src/chaos/wadaConvergence.ts:169](../../../src/chaos/wadaConvergence.ts) — Declaration wadaResolutionConvergence | S19 |  |
| analysis:zero-one | 0-1 chaos test | [src/chaos/zeroOneTest.ts:127](../../../src/chaos/zeroOneTest.ts) — Declaration zeroOneTest | S18 |  |
| control:audio | Motion and energy audio sonification | [src/app/AudioSonifier.ts:26](../../../src/app/AudioSonifier.ts) — Declaration AudioSonifier | S07 |  |
| control:forcing-and-feedback | Delayed and chaos-control feedback | [src/chaos/chaosControl.ts:211](../../../src/chaos/chaosControl.ts) — Declaration simulateOgyControl | S14 |  |
| control:locale-and-theme | Language, theme and accessibility preferences | [src/app/uiLocale.ts:140](../../../src/app/uiLocale.ts) — Declaration uiMessage | S05 |  |
| control:physical-parameters | Shared parameter and initial-condition controls | [src/app/systemControls.ts:32](../../../src/app/systemControls.ts) — Declaration readSystem | S06 |  |
| control:precision | Integrator precision controls | [src/app/precisionControls.ts:476](../../../src/app/precisionControls.ts) — Declaration installPrecisionControls | S06 |  |
| control:run-and-history | Run, replay, recording and step controls | [src/app/LabControls.ts:155](../../../src/app/LabControls.ts) — Declaration LabControls | S07 |  |
| control:search-and-commands | Command palette and control search | [src/app/parity/command-palette.ts:323](../../../src/app/parity/command-palette.ts) — Declaration installCommandPalettes | S06 |  |
| exporter:figure | Publication figure pipeline | [src/research/figurePipeline.ts:88](../../../src/research/figurePipeline.ts) — Declaration renderStudyFigureSvg | S24 |  |
| exporter:lab | Trajectory CSV, figure and experiment export | [src/app/labExport.ts:39](../../../src/app/labExport.ts) — Declaration trajectoryCsv | S07 |  |
| exporter:notebook | Reproducible notebook generation | [src/research/notebookBuilder.ts:57](../../../src/research/notebookBuilder.ts) — Declaration buildNotebookV2 | S24 |  |
| exporter:package | Reproduction package and manifest | [src/research/reproPackage.ts:99](../../../src/research/reproPackage.ts) — Declaration buildReproPackage | S24 |  |
| exporter:zip | ZIP bundle and checksums | [src/research/zipBundle.ts:176](../../../src/research/zipBundle.ts) — Declaration buildZip | S24 |  |
| importer:imu | IMU sensor observation capture | [src/browser/imuMotionCapture.ts:73](../../../src/browser/imuMotionCapture.ts) — Declaration ImuMotionCaptureController | S22 |  |
| importer:observations | CSV and observation data parsing | [src/research/experimentalDataImport.ts:108](../../../src/research/experimentalDataImport.ts) — Declaration parseObservedDoublePendulumCsv | S22 |  |
| importer:saved-run | Saved trajectory imports | [src/browser/savedRunImport.ts:12](../../../src/browser/savedRunImport.ts) — Declaration parseAndApplySavedRun | S28 |  |
| importer:video | Video marker tracking and calibration | [src/browser/videoMarkerCapture.ts:76](../../../src/browser/videoMarkerCapture.ts) — Declaration VideoMarkerCaptureController | S22 |  |
| importer:workspace | Validated and atomic workspace imports | [src/app/parity/workspace-import-transaction.ts:366](../../../src/app/parity/workspace-import-transaction.ts) — Declaration runWorkspaceImportTransaction | S28 |  |
| integrator:adaptive-controller | Accepted/rejected adaptive integration and replay | [src/physics/adaptive.ts:301](../../../src/physics/adaptive.ts) — Declaration integrateAdaptive | S07 |  |
| integrator:canonical | Canonical-coordinate symplectic integration | [src/physics/canonical.ts:119](../../../src/physics/canonical.ts) — Declaration canonicalRhs | S07 |  |
| integrator:sde-additive | Euler-Maruyama and additive noise | [src/physics/stochasticAdditive.ts:38](../../../src/physics/stochasticAdditive.ts) — Declaration eulerMaruyamaStep | S16 |  |
| integrator:sde-matrix | Commutative Milstein and Stratonovich Heun | [src/physics/stochasticMatrixNoise.ts:295](../../../src/physics/stochasticMatrixNoise.ts) — Declaration commutativeMilsteinStep | S16 |  |
| integrator:sde-multiplicative | Scalar Milstein multiplicative noise | [src/physics/stochasticMultiplicative.ts:9](../../../src/physics/stochasticMultiplicative.ts) — Declaration milsteinStep | S16 |  |
| route:deep-link | Control deep-link parsing and validation | [src/app/deepLinkControls.ts:125](../../../src/app/deepLinkControls.ts) — Declaration applyNumericControlParams | S28 |  |
| route:share | Versioned experiment share envelopes | [src/app/experimentShareCodec.ts:420](../../../src/app/experimentShareCodec.ts) — Declaration encodeSharedExperiment | S03 |  |
| route:tabs | Legacy tab query and browser history | [src/app/tabRouting.ts:36](../../../src/app/tabRouting.ts) — Declaration urlForTab | S03 |  |
| runtime:gpu | GPU acceleration and validated fallback | [src/runtime/gpuEnsemble.ts:326](../../../src/runtime/gpuEnsemble.ts) — Declaration runDoublePendulumEnsemble | S21 |  |
| runtime:jobs | Worker scheduling, progress and cancellation | [src/workers/JobEngine.ts:134](../../../src/workers/JobEngine.ts) — Declaration JobEngine | S21 |  |
| runtime:public-globals | Stable public scripting namespace and legacy aliases | [src/runtime/globalApi.ts:27](../../../src/runtime/globalApi.ts) — Declaration publishPublicApi | S28 |  |
| runtime:wasm | Wasm simulation acceleration | [src/runtime/wasmEnsemble.ts:135](../../../src/runtime/wasmEnsemble.ts) — Declaration runDoublePendulumEnsembleWasm | S21 |  |
| storage-schema:provenance | Run and artifact provenance contracts | [src/research/provenance.ts:75](../../../src/research/provenance.ts) — Declaration ProvenanceBuilder | S24 |  |
| storage-schema:research-db | IndexedDB projects, runs and artifacts | [src/research/researchDb.ts:118](../../../src/research/researchDb.ts) — Declaration ResearchDb | S24 |  |
| storage-schema:session | Session state and migration validation | [src/state/sessionSchema.ts:2](../../../src/state/sessionSchema.ts) — Declaration SESSION_SCHEMA_VERSION | S03 |  |
| storage-schema:workspace | Legacy workspace storage and import shape | [src/app/parity/storage-schema.ts:49](../../../src/app/parity/storage-schema.ts) — Declaration RESEARCH_STORAGE_KEY | S28 |  |
| system:cartpole | Open-loop cart-pole expansion model | [src/physics/expandedModels-factory.ts:25](../../../src/physics/expandedModels-factory.ts) — Declaration EXPANSION_MODEL_DEFINITIONS | S13 | Existing model applies constant open-loop force; a feedback controller is not claimed. |
| system:chain | Variable-length planar pendulum chain | [src/physics/nPendulum.ts:131](../../../src/physics/nPendulum.ts) — Declaration rhsChain | S10 |  |
| system:chimera-exploration | Chimera-seeded nonlocal Kuramoto exploration | [src/app/researchPlusModels.ts:25](../../../src/app/researchPlusModels.ts) — Declaration buildSynchronizationExploration | S15 | Reuses Kuramoto dynamics and chimera diagnostics, not an independent engine. |
| system:compound-double | Uniform-rod compound double pendulum | [src/physics/compoundDouble.ts:145](../../../src/physics/compoundDouble.ts) — Declaration rhsCompoundDouble | S07 |  |
| system:coupled | Coupled pendulums expansion model | [src/physics/expandedModels-factory.ts:25](../../../src/physics/expandedModels-factory.ts) — Declaration EXPANSION_MODEL_DEFINITIONS | S13 |  |
| system:double | Point-mass double pendulum | [src/physics/double.ts:98](../../../src/physics/double.ts) — Declaration rhsDouble | S07 |  |
| system:double-string | Unilateral double-string pendulum | [src/physics/doubleString.ts:194](../../../src/physics/doubleString.ts) — Declaration DoubleStringPendulum | S11 |  |
| system:driven | Damped and periodically driven pendulum | [src/physics/driven.ts:60](../../../src/physics/driven.ts) — Declaration rhsDriven | S13 |  |
| system:duffing | Duffing oscillator | [src/physics/duffing.ts:78](../../../src/physics/duffing.ts) — Declaration rhsDuffing | S14 |  |
| system:fput | FPUT nonlinear chain | [src/physics/fput.ts:55](../../../src/physics/fput.ts) — Declaration fputAcceleration | S16 |  |
| system:friction | Coulomb and Stribeck friction dynamics | [src/physics/friction.ts:107](../../../src/physics/friction.ts) — Declaration applyStribeckFriction | S14 |  |
| system:huygens-phase-pair | Huygens two-clock phase reduction | [src/physics/kuramoto.ts:212](../../../src/physics/kuramoto.ts) — Declaration rhsHuygensPhasePair | S15 | Phase reduction only; no mechanical escapement/contact model. |
| system:inverted | Open-loop inverted pendulum expansion model | [src/physics/expandedModels-factory.ts:25](../../../src/physics/expandedModels-factory.ts) — Declaration EXPANSION_MODEL_DEFINITIONS | S13 |  |
| system:kapitza | Kapitza pendulum | [src/physics/kapitza.ts:76](../../../src/physics/kapitza.ts) — Declaration rhsKapitza | S14 |  |
| system:kuramoto | Kuramoto phase oscillator network | [src/physics/kuramoto.ts:59](../../../src/physics/kuramoto.ts) — Declaration rhsKuramoto | S15 |  |
| system:langevin | Seeded Langevin paths and ensembles | [src/physics/stochastic.ts:433](../../../src/physics/stochastic.ts) — Declaration runLangevinEnsemble | S16 |  |
| system:lattice-fk-limit | Pendulum lattice / harmonic Frenkel-Kontorova limit | [src/physics/pendulumNetwork.ts:291](../../../src/physics/pendulumNetwork.ts) — Declaration ringPhononDispersion | S16 | Existing nearest-neighbour pendulum network and harmonic dispersion; not a claim of a separate general FK depinning solver. |
| system:magnetic | Multi-magnet pendulum | [src/physics/magneticPendulum.ts:114](../../../src/physics/magneticPendulum.ts) — Declaration rhsMagneticPendulum | S15 |  |
| system:mathieu | Linear Mathieu stability model | [src/chaos/mathieuStability.ts:96](../../../src/chaos/mathieuStability.ts) — Declaration mathieuStabilityDiagram | S14 |  |
| system:parametric | Parametrically excited expansion pendulum | [src/physics/expandedModels-factory.ts:25](../../../src/physics/expandedModels-factory.ts) — Declaration EXPANSION_MODEL_DEFINITIONS | S13 |  |
| system:pendulum-network | Coupled pendulum graph | [src/physics/pendulumNetwork.ts:177](../../../src/physics/pendulumNetwork.ts) — Declaration rhsPendulumNetwork | S15 |  |
| system:pyragas | Pyragas delayed-feedback trajectory | [src/physics/pyragasDde.ts:119](../../../src/physics/pyragasDde.ts) — Declaration integratePyragasPendulumDde | S14 |  |
| system:quantum-kicked-rotor | Quantum kicked rotor | [src/physics/quantumKickedRotor.ts:80](../../../src/physics/quantumKickedRotor.ts) — Declaration createQkrState | S17 |  |
| system:rope | Unilateral rope pendulum | [src/physics/rope.ts:67](../../../src/physics/rope.ts) — Declaration RopePendulum | S11 |  |
| system:sine-gordon | Sine-Gordon field | [src/physics/sineGordon.ts:204](../../../src/physics/sineGordon.ts) — Declaration createSineGordonField | S16 |  |
| system:spherical | Angular-coordinate spherical pendulum | [src/physics/spherical.ts:160](../../../src/physics/spherical.ts) — Declaration SphericalPendulum | S12 |  |
| system:spherical-chain | Angular-coordinate spherical chain | [src/physics/sphericalChain.ts:487](../../../src/physics/sphericalChain.ts) — Declaration SphericalChain | S12 |  |
| system:spherical-embedded | Embedded constrained spherical pendulum | [src/physics/sphericalEmbedded.ts:166](../../../src/physics/sphericalEmbedded.ts) — Declaration EmbeddedSphericalPendulum | S12 |  |
| system:spherical-embedded-chain | Embedded constrained spherical chain | [src/physics/sphericalEmbeddedChain.ts:406](../../../src/physics/sphericalEmbeddedChain.ts) — Declaration EmbeddedSphericalChain | S12 |  |
| system:spring | Spring pendulum with radial motion | [src/physics/spring.ts:50](../../../src/physics/spring.ts) — Declaration rhsSpring | S11 |  |
| system:standard-map | Standard map iteration | [src/physics/standardMap.ts:22](../../../src/physics/standardMap.ts) — Declaration standardMapStep | S17 |  |
| system:triple | Triple pendulum | [src/physics/triple.ts:74](../../../src/physics/triple.ts) — Declaration rhsTriple | S10 |  |
| system:unitary-floquet | Unitary Floquet spectral evolution | [src/research/unitaryFloquet.ts:275](../../../src/research/unitaryFloquet.ts) — Declaration complexUnitaryFloquetSpectrum | S17 |  |
| system:van-der-pol | Van der Pol oscillator | [src/physics/vanDerPol.ts:45](../../../src/physics/vanDerPol.ts) — Declaration rhsVanDerPol | S14 |  |

## 검사 오류

없음. 소유권/향후 단계 누락 0, 깨진 relative import/named binding 0.

## 리터럴로 해석되지 않은 동적 import

- e2e/webgpu-hardware-reductions.spec.ts:18: `import(/* @vite-ignore */ modulePath)`
- e2e/webgpu-hardware-reductions.spec.ts:55: `import(/* @vite-ignore */ modulePath)`
- e2e/webgpu-hardware-reductions.spec.ts:92: `import(/* @vite-ignore */ modulePath)`
- e2e/webgpu-hardware-reductions.spec.ts:142: `import(/* @vite-ignore */ modulePath)`
- scripts/gpu-benchmark-ladder.ts:299: `import(
      /* @vite-ignore */ ensembleModulePath
    )`
- scripts/gpu-benchmark-ladder.ts:302: `import(
      /* @vite-ignore */ spectrumModulePath
    )`
- scripts/gpu-benchmark-ladder.ts:305: `import(
      /* @vite-ignore */ chaosModulePath
    )`
- scripts/gpu-benchmark-ladder.ts:308: `import(
      /* @vite-ignore */ nChainModulePath
    )`
- scripts/webgpu-hardware-validation.ts:153: `import(/* @vite-ignore */ ensembleModulePath)`
- scripts/webgpu-hardware-validation.ts:154: `import(
      /* @vite-ignore */ spectrumModulePath
    )`
- scripts/webgpu-hardware-validation.ts:157: `import(
      /* @vite-ignore */ promotionModulePath
    )`
- scripts/webgpu-hardware-validation.ts:160: `import(
      /* @vite-ignore */ nChainModulePath
    )`

상세 필드/공개 심볼/legacy control ID/저장 schema/worker 메시지/fixture 목록과 원본 hash는 [inventory.json](inventory.json)에 있다. 내용 검토는 자동·소스 확인이며 사람/물리 전문가 검토 완료로 표시하지 않는다.
