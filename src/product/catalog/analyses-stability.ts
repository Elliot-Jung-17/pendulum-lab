import type { AnalysisDefinition } from '../contracts/catalog';
import { analysis, driven, initialState, rhs } from './analyses-helpers';

export const stabilityAnalyses: readonly AnalysisDefinition[] = [
  analysis({
    id: 'analysis:fixed-point',
    name: ['고정점 선형 분류', 'Fixed-point linear classification'],
    module: 'src/chaos/fixedPointClassify.ts',
    exports: ['classifyFixedPoint'],
    stage: 20,
    description: [
      '반환 맵의 Floquet 승수로 고정점의 선형 안정성을 분류합니다.',
      'Classify fixed-point linear stability from return-map Floquet multipliers.'
    ],
    inputs: [
      [
        'multipliers',
        '실수·허수·절댓값을 포함한 FloquetMultiplier 목록.',
        'FloquetMultiplier entries containing real part, imaginary part and modulus.'
      ]
    ],
    parameters: [
      'classifyFixedPoint(multipliers); 기존 단위원 근접 허용치를 사용합니다.',
      'classifyFixedPoint(multipliers); uses the existing unit-circle proximity tolerance.'
    ],
    output: [
      'fixed-point-classification',
      '안정성 종류, 스펙트럼 반경과 회전 진단.',
      'Stability class, spectral radius and rotation diagnostics.'
    ],
    cost: ['승수 목록 정렬 비용.', 'Cost of sorting the multiplier list.'],
    limitation: [
      'ODE Jacobian의 연속 시간 고유값을 그대로 넣을 수 없으며 비선형 안정성은 보장하지 않습니다.',
      'Continuous-time ODE Jacobian eigenvalues are not interchangeable with return-map multipliers; nonlinear stability is not guaranteed.'
    ]
  }),
  analysis({
    id: 'analysis:periodic-orbits',
    name: ['주기 궤도 데이터베이스', 'Periodic orbit database'],
    module: 'src/chaos/periodicOrbitDatabase.ts',
    exports: ['buildPeriodicOrbitDatabase'],
    stage: 20,
    description: [
      '맵의 여러 초기 추정과 주기로 주기점을 탐색하고 중복을 제거합니다.',
      'Search periodic map points over seeds and periods, then remove duplicates.'
    ],
    inputs: [
      ['map-function', '출력 버퍼를 채우는 기존 MapFn.', 'Legacy MapFn that fills an output buffer.'],
      ['point-cloud', '동일 차원의 초기 추정 벡터들.', 'Initial guess vectors of a common dimension.']
    ],
    parameters: [
      'periods와 PeriodicOrbitDatabaseOptions의 shooting·중복 판정 옵션.',
      'periods and shooting/deduplication settings in PeriodicOrbitDatabaseOptions.'
    ],
    output: [
      'periodic-orbit-database',
      '주기 궤도, 잔차와 탐색 메타데이터.',
      'Periodic orbits, residuals and search metadata.'
    ],
    cost: [
      '초기 추정 수×주기 수×shooting 반복과 맵 평가 비용.',
      'Seeds times periods times shooting iterations and map-evaluation cost.'
    ],
    limitation: [
      '맵 또는 준비된 반환 맵이 필요하며 유한 초기 추정으로 모든 주기 궤도를 찾지는 못합니다.',
      'Requires a map or prepared return map; finite seeds cannot find all periodic orbits.'
    ]
  }),
  analysis({
    id: 'analysis:floquet',
    name: ['Floquet 승수', 'Floquet multipliers'],
    module: 'src/chaos/floquet.ts',
    exports: ['floquetAnalysis'],
    stage: 20,
    description: [
      '주기 궤도의 첫 두 상태 방향에 대한 모노드로미 블록을 분석합니다.',
      'Analyze the monodromy block for the first two state directions of a periodic orbit.'
    ],
    inputs: [
      [
        'periodic-orbit',
        '주기 궤도 위 초기 상태와 양의 주기.',
        'Initial state on a periodic orbit and its positive period.'
      ],
      rhs
    ],
    scope: {
      systemIds: [
        'system:driven',
        'system:inverted',
        'system:parametric',
        'system:duffing',
        'system:van-der-pol',
        'system:kapitza'
      ],
      evolutions: ['ode']
    },
    parameters: [
      'floquetAnalysis(x0, rhs, period, FtleOptions, jacobian?); 2×2 상태 블록.',
      'floquetAnalysis(x0, rhs, period, FtleOptions, jacobian?); a 2-by-2 state block.'
    ],
    output: [
      'floquet-multipliers',
      '2×2 모노드로미, 승수, 안정성 및 행렬식.',
      '2-by-2 monodromy, multipliers, stability and determinant.'
    ],
    cost: [
      '한 주기의 변분 적분과 2×2 고유값 계산.',
      'One-period variational integration and a 2-by-2 eigenvalue calculation.'
    ],
    limitation: [
      '일반 고차원 전체 스펙트럼이 아닙니다. 첫 두 방향이 닫힌 물리 상태 블록인지와 실제 주기 궤도인지 호출자가 확인해야 합니다.',
      'Not a full arbitrary-dimensional spectrum. Caller must verify that the first two directions form the physical state block and the supplied orbit is periodic.'
    ]
  }),
  analysis({
    id: 'analysis:floquet-linear',
    name: ['선형 주기계 Floquet', 'Linear-periodic Floquet spectrum'],
    module: 'src/chaos/floquetLinear.ts',
    exports: ['floquetLinearSpectrum'],
    stage: 20,
    description: [
      '주기적인 선형 계수 행렬을 적분해 전파자와 스펙트럼을 구합니다.',
      'Integrate a periodic linear coefficient matrix to obtain its propagator and spectrum.'
    ],
    inputs: [
      [
        'linear-operator',
        'CoefficientAt 규약의 시간별 실수 계수 행렬 A(t).',
        'Time-dependent real coefficient matrix A(t) following CoefficientAt.'
      ]
    ],
    parameters: [
      'period, dimension, FloquetLinearOptions의 steps와 검증 설정.',
      'period, dimension, and steps/validation settings from FloquetLinearOptions.'
    ],
    output: [
      'linear-floquet-spectrum',
      '모노드로미, 복소 승수·지수와 검증 진단.',
      'Monodromy, complex multipliers/exponents and validation diagnostics.'
    ],
    cost: ['행렬 전파자 적분 단계와 조밀 고유값 분해.', 'Matrix-propagator integration steps and dense eigenanalysis.'],
    limitation: [
      '실수 선형 주기 계수 모델이 필요하며 임의 비선형 궤도의 선형화를 자동 생성하지 않습니다.',
      'Requires a real linear-periodic coefficient model; does not automatically linearize arbitrary nonlinear trajectories.'
    ]
  }),
  analysis({
    id: 'analysis:melnikov',
    name: ['Melnikov 분리선 분할', 'Melnikov separatrix splitting'],
    module: 'src/chaos/melnikov.ts',
    exports: ['melnikovFunction', 'melnikovFunctionNumeric'],
    stage: 20,
    description: [
      '약하게 감쇠·구동되는 진자의 분리선 분할을 1차 근사합니다.',
      'Approximate separatrix splitting of a weakly damped and driven pendulum to first order.'
    ],
    inputs: [
      [
        'parameters',
        'DrivenParameters와 무차원 위상 이동 tau0.',
        'DrivenParameters and dimensionless phase shift tau0.'
      ]
    ],
    scope: driven,
    parameters: [
      'melnikovFunction(tau0, p); 수치 적분 확인은 halfWidth와 intervals 옵션.',
      'melnikovFunction(tau0, p); numerical cross-check uses halfWidth and intervals options.'
    ],
    output: ['melnikov-value', '위상별 Melnikov 함수값.', 'Melnikov function value at a phase.'],
    cost: [
      '해석식은 상수 비용, 수치 확인은 적분 구간 수에 비례합니다.',
      'Closed form has constant cost; numerical verification scales with quadrature intervals.'
    ],
    limitation: [
      '등록 기본 함수는 구동 진자 전용 약섭동 근사이며 강한 구동의 혼돈을 확정하지 않습니다.',
      'The registered primary function is a weak-perturbation driven-pendulum approximation; it does not establish chaos under strong forcing.'
    ]
  }),
  analysis({
    id: 'analysis:continuation',
    name: ['자연 매개변수 연속법', 'Natural-parameter continuation'],
    module: 'src/chaos/continuation.ts',
    exports: ['continueDrivenPeriodicOrbit'],
    stage: 20,
    description: [
      '구동 진자의 매개변수를 변화시키며 주기 궤도 가지를 추적합니다.',
      'Follow a driven-pendulum periodic-orbit branch as a parameter changes.'
    ],
    inputs: [['parameters', '기준 DrivenParameters.', 'Base DrivenParameters.']],
    scope: driven,
    parameters: [
      'ContinuationOptions의 parameter, start, end, step, guess와 shooting 허용치.',
      'ContinuationOptions parameter, start, end, step, guess and shooting tolerances.'
    ],
    output: [
      'continuation-branch',
      '주기점 가지와 안정성 변화 후보.',
      'Periodic-point branch and candidate stability changes.'
    ],
    cost: [
      '매개변수 단계마다 주기 궤도와 Floquet 계산을 반복합니다.',
      'Repeats periodic-orbit and Floquet calculations at each parameter step.'
    ],
    limitation: [
      '구동 진자 전용이며 자연 매개변수 연속법은 접힘점에서 실패할 수 있습니다.',
      'Driven-pendulum specific; natural-parameter continuation may fail at folds.'
    ]
  }),
  analysis({
    id: 'analysis:arclength',
    name: ['의사 호길이 연속법', 'Pseudo-arclength continuation'],
    module: 'src/chaos/arclength.ts',
    exports: ['continueArclength'],
    stage: 20,
    description: [
      '잔차 G(x, λ)=0의 해 가지를 호길이 예측·수정으로 추적합니다.',
      'Follow a solution branch of G(x, lambda)=0 with arclength predictor-corrector steps.'
    ],
    inputs: [
      [
        'residual-function',
        'dimension과 residual(x, lambda)를 가진 ArclengthSystem.',
        'ArclengthSystem with dimension and residual(x, lambda).'
      ]
    ],
    parameters: [
      'ArclengthOptions의 x0, lambda0, ds, steps, direction 및 Newton 설정.',
      'ArclengthOptions x0, lambda0, ds, steps, direction and Newton settings.'
    ],
    output: [
      'arclength-branch',
      '해 가지, 접선 매개변수 성분과 접힘 후보.',
      'Solution branch, parameter tangent component and fold candidates.'
    ],
    cost: [
      '각 단계에서 유한차분 Jacobian과 조밀 Newton 선형계를 풉니다.',
      'Each step computes finite-difference Jacobians and solves dense Newton systems.'
    ],
    limitation: [
      '사용 가능한 잔차 함수를 호출자가 제공해야 하며 특이점 통과와 전역 가지 발견을 보장하지 않습니다.',
      'Caller must provide a usable residual; singular-point passage and global branch discovery are not guaranteed.'
    ]
  }),
  analysis({
    id: 'analysis:branch-switch',
    name: ['주기배가 가지 전환', 'Period-doubling branch switching'],
    module: 'src/chaos/branchSwitching.ts',
    exports: ['switchPeriodDoubling'],
    stage: 20,
    description: [
      '구동 진자의 주기 1 궤도에서 주기 2 궤도의 초기 추정을 만듭니다.',
      'Seed a period-two orbit from a period-one driven-pendulum orbit.'
    ],
    inputs: [
      ['parameters', 'DrivenParameters.', 'DrivenParameters.'],
      ['periodic-orbit', '기존 주기 1 고정점의 [theta, omega].', 'Existing period-one fixed point [theta, omega].']
    ],
    scope: driven,
    parameters: [
      'BranchSwitchOptions의 dt, minSeparation, seedSteps와 shooting 설정.',
      'BranchSwitchOptions dt, minSeparation, seedSteps and shooting settings.'
    ],
    output: [
      'branch-switch-result',
      '주기 2 후보와 수렴·분리 진단.',
      'Period-two candidate and convergence/separation diagnostics.'
    ],
    cost: [
      '여러 초기 섭동마다 두 주기의 shooting을 시도합니다.',
      'Attempts two-period shooting for multiple seed perturbations.'
    ],
    limitation: [
      '구동 진자의 주기배가 경로 전용이며 일반 분기점의 가지 전환기는 아닙니다.',
      'Specific to driven-pendulum period doubling; not a general bifurcation branch switcher.'
    ]
  }),
  analysis({
    id: 'analysis:bifurcation-detection',
    name: ['분기 후보 탐지', 'Bifurcation candidate detection'],
    module: 'src/chaos/bifurcationDetect.ts',
    exports: ['detectBifurcations'],
    stage: 20,
    description: [
      '매개변수별 반환값의 서로 다른 값 개수로 분기 후보를 찾습니다.',
      'Find bifurcation candidates from distinct return-value counts along a parameter sweep.'
    ],
    inputs: [
      [
        'parameter-grid',
        'param과 values를 가진 순서 있는 BifurcationColumn 목록.',
        'Ordered BifurcationColumn entries containing param and values.'
      ]
    ],
    parameters: [
      'BifurcationDetectionOptions의 tolerance와 chaosCountThreshold.',
      'BifurcationDetectionOptions tolerance and chaosCountThreshold.'
    ],
    output: [
      'bifurcation-candidates',
      '후보 사건, 값 개수와 혼돈 열 비율.',
      'Candidate events, value counts and fraction of chaotic columns.'
    ],
    cost: ['매개변수 열과 각 열의 표본 분류 비용.', 'Cost of classifying samples across parameter columns.'],
    limitation: [
      '서로 다른 값 개수를 이용한 휴리스틱으로 엄밀한 분기 인증이나 Floquet 분석을 대체하지 않습니다.',
      'A distinct-count heuristic; not a substitute for bifurcation certification or Floquet analysis.'
    ]
  }),
  analysis({
    id: 'analysis:neimark-sacker',
    name: ['Neimark–Sacker 탐지', 'Neimark–Sacker detection'],
    module: 'src/chaos/neimarkSacker.ts',
    exports: ['detectNeimarkSacker', 'continueNeimarkSackerTorus'],
    stage: 20,
    description: [
      '가지의 복소 승수가 단위원을 통과하는 후보를 검출합니다.',
      'Detect candidate complex-multiplier crossings of the unit circle along a branch.'
    ],
    inputs: [
      [
        'continuation-branch',
        '매개변수와 Floquet 승수를 포함한 BranchSample 목록.',
        'BranchSample entries containing parameters and Floquet multipliers.'
      ]
    ],
    parameters: [
      'detectNeimarkSacker(branch, resonanceTolerance); 토러스 연속은 별도 PlanarMapSystem 규약.',
      'detectNeimarkSacker(branch, resonanceTolerance); torus continuation has a separate PlanarMapSystem contract.'
    ],
    output: [
      'neimark-sacker-candidates',
      '단위원 교차와 공명 근접 진단.',
      'Unit-circle crossings and resonance-proximity diagnostics.'
    ],
    cost: ['기존 가지 표본 수와 승수 수에 비례합니다.', 'Scales with existing branch samples and multiplier counts.'],
    limitation: [
      '기본 탐지는 가지 자료 분석입니다. 토러스 추적에는 별도의 매개변수화된 평면 맵이 필요합니다.',
      'Primary detection analyzes branch data. Torus continuation separately requires a parameterized planar map.'
    ]
  }),
  analysis({
    id: 'analysis:torus',
    name: ['토러스 리아푸노프 진단', 'Torus Lyapunov diagnostics'],
    module: 'src/chaos/torusAnalysis.ts',
    exports: ['torusLyapunovSpectrum'],
    stage: 20,
    description: [
      '평면 맵의 두 리아푸노프 지수로 불변 원 후보를 진단합니다.',
      'Diagnose an invariant-circle candidate from two Lyapunov exponents of a planar map.'
    ],
    inputs: [
      [
        'map-function',
        'PlanarMapSystem의 매개변수화된 2차원 맵.',
        'Parameterized two-dimensional map in PlanarMapSystem.'
      ],
      ['state', '두 성분의 초기 seed.', 'Two-component initial seed.']
    ],
    parameters: [
      'parameter와 TorusLyapunovOptions의 iterations, transient, 유한차분·영지수 허용치.',
      'parameter and TorusLyapunovOptions iterations, transient, finite-difference and zero-exponent tolerances.'
    ],
    output: [
      'torus-lyapunov-report',
      '두 지수, 접선·횡방향 진단과 후보 판정.',
      'Two exponents, on-circle/transverse diagnostics and candidate verdict.'
    ],
    cost: [
      '각 반복마다 유한차분 맵 평가와 2차원 QR.',
      'Finite-difference map evaluations and two-dimensional QR per iteration.'
    ],
    limitation: [
      '2차원 맵 전용이며 0에 가까운 지수만으로 매끄러운 토러스 존재를 증명하지 않습니다.',
      'For two-dimensional maps; near-zero exponents alone do not prove a smooth torus exists.'
    ]
  }),
  analysis({
    id: 'analysis:arnold-tongue',
    name: ['모드 잠금 매개변수 스캔', 'Mode-locking parameter scan'],
    module: 'src/chaos/arnoldTongue.ts',
    exports: ['scanModeLocking'],
    stage: 20,
    description: [
      '원형 맵 계열의 회전수를 유리수와 비교해 잠금 구간을 찾습니다.',
      'Find locking intervals by comparing rotation numbers of circle-map families with rationals.'
    ],
    inputs: [
      [
        'map-function',
        '매개변수로 CircleMap을 만드는 mapFactory.',
        'mapFactory that creates a CircleMap for a parameter.'
      ]
    ],
    parameters: [
      'start, end, steps, rationals, tolerance와 rotationOptions.',
      'start, end, steps, rationals, tolerance and rotationOptions.'
    ],
    output: [
      'mode-locking-scan',
      '회전수 곡선, 유리수 잠금 구간과 단조성 진단.',
      'Rotation-number curve, rational locking intervals and monotonicity diagnostics.'
    ],
    cost: ['매개변수 표본 수×회전수 추정 반복 수.', 'Parameter samples times rotation-number estimation iterations.'],
    limitation: [
      '등록 함수는 원형 맵의 1차원 매개변수 스캔이며 전체 2차원 Arnold tongue 지도를 자동 생성하지 않습니다.',
      'The registered function scans one parameter of a circle map; it does not automatically produce a full two-parameter Arnold tongue map.'
    ]
  }),
  analysis({
    id: 'analysis:codimension-two',
    name: ['두 매개변수 상태 지도', 'Two-parameter regime map'],
    module: 'src/chaos/codimTwo.ts',
    exports: ['codimTwoDiagram'],
    stage: 20,
    description: [
      '두 매개변수 격자에서 최대 리아푸노프 지수의 부호를 분류합니다.',
      'Classify the sign of maximal Lyapunov exponents over a two-parameter grid.'
    ],
    inputs: [
      [
        'parameterized-model',
        'makeSpec(x, y)가 기존 SystemSpec을 반환하는 모델.',
        'Model whose makeSpec(x, y) returns a legacy SystemSpec.'
      ],
      initialState
    ],
    scope: {
      systemIds: [
        'system:double',
        'system:compound-double',
        'system:triple',
        'system:chain',
        'system:driven',
        'system:spring',
        'system:spherical-chain'
      ],
      evolutions: ['ode']
    },
    parameters: [
      'xParam, xRange, yParam, yRange와 CodimTwoOptions의 n, steps, dt, neutralBand.',
      'xParam, xRange, yParam, yRange and CodimTwoOptions n, steps, dt, neutralBand.'
    ],
    output: [
      'regime-grid',
      '리아푸노프 값·상태 분류 격자, 경계 수와 재현 해시.',
      'Lyapunov/regime grid, boundary counts and reproducibility hash.'
    ],
    cost: [
      '격자 해상도 제곱×각 셀의 리아푸노프 적분 비용.',
      'Squared grid resolution times each cell Lyapunov integration cost.'
    ],
    limitation: [
      '기존 연속 SystemSpec 범위에 한정합니다. 부호 지도는 여차원 2 특이점의 인증이 아닙니다.',
      'Restricted to the existing continuous SystemSpec scope. A sign map does not certify codimension-two singularities.'
    ]
  })
];
