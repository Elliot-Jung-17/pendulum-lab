import type { AnalysisDefinition } from '../contracts/catalog';
import { analysis, ode, initialState, rhs } from './analyses-helpers';

export const researchAnalyses: readonly AnalysisDefinition[] = [
  analysis({
    id: 'analysis:experiment-design',
    name: ['라틴 초입방체 실험 설계', 'Latin hypercube experiment design'],
    module: 'src/research/experimentDesign.ts',
    exports: ['latinHypercube'],
    stage: 21,
    description: [
      '시드 기반 층화 표본을 단위 초입방체에 생성합니다.',
      'Generate seeded stratified samples in a unit hypercube.'
    ],
    inputs: [
      ['parameters', '차원 dim, 표본 수 count와 선택적 seedText.', 'Dimension dim, sample count and optional seedText.']
    ],
    parameters: [
      'latinHypercube(dim, count, seedText)의 기존 반올림 규약.',
      'Legacy rounding semantics of latinHypercube(dim, count, seedText).'
    ],
    output: [
      'design-points',
      '단위 구간 좌표의 실험 설계점.',
      'Experimental design points in unit-interval coordinates.'
    ],
    cost: ['차원×표본 수에 비례합니다.', 'Linear in dimension times sample count.'],
    limitation: [
      '설계점 생성만 수행하며 물리 범위 환산과 엔진 평가·앙상블 실행은 호출자가 담당합니다.',
      'Generates design points only; callers map physical ranges and execute models or ensembles.'
    ]
  }),
  analysis({
    id: 'analysis:integrator-comparison',
    name: ['확장 모델 적분법 비교', 'Expansion integrator comparison'],
    module: 'src/physics/expandedModels-runners.ts',
    exports: ['runExpansionSuite'],
    stage: 21,
    description: [
      '기존 확장 모델 구성으로 여러 적분법의 궤도와 진단을 비교합니다.',
      'Compare trajectories and diagnostics across integrators for existing expansion configurations.'
    ],
    inputs: [
      [
        'parameters',
        '지원 ExpansionModelId를 가진 ExpansionSuiteConfig.',
        'ExpansionSuiteConfig with a supported ExpansionModelId.'
      ]
    ],
    scope: {
      systemIds: [
        'system:driven',
        'system:coupled',
        'system:inverted',
        'system:cartpole',
        'system:parametric',
        'system:spherical',
        'system:chain'
      ],
      evolutions: ['ode']
    },
    parameters: [
      'config의 model, methods, dt, horizon, parameterOverrides와 선택적 Lyapunov profiler.',
      'config model, methods, dt, horizon, parameterOverrides and optional Lyapunov profiler.'
    ],
    output: [
      'integrator-comparison',
      '적분법별 표본, 에너지 및 선택적 혼돈 진단.',
      'Per-integrator samples, energy and optional chaos diagnostics.'
    ],
    cost: [
      '적분법 수×적분 길이에 추가 진단 비용이 더해집니다.',
      'Integrator count times integration horizon, plus additional diagnostics.'
    ],
    limitation: [
      'ExpansionModelId 7종 전용이며 구면·사슬 모델도 이 runner의 기존 좌표·설정 규약을 따라야 합니다.',
      'Restricted to seven ExpansionModelId values; spherical and chain models must follow this runner’s existing coordinate/configuration contracts.'
    ]
  }),
  analysis({
    id: 'analysis:parameter-estimation',
    name: ['이중 진자 매개변수 추정', 'Double-pendulum parameter estimation'],
    module: 'src/research/parameterEstimation.ts',
    exports: ['fitDoublePendulum'],
    stage: 22,
    description: [
      '관측한 두 각도의 시계열에 이중 진자 매개변수를 적합합니다.',
      'Fit double-pendulum parameters to observed two-angle time series.'
    ],
    inputs: [
      [
        'observations',
        '시간과 두 각도를 포함한 DoublePendulumObservation.',
        'DoublePendulumObservation containing times and paired angles.'
      ],
      [
        'state',
        '알려진 초기 [theta1, theta2, omega1, omega2]; 초기 각속도는 적합 중 고정됩니다.',
        'Known initial [theta1, theta2, omega1, omega2]; initial angular velocities remain fixed during fitting.'
      ],
      [
        'parameters',
        '기준 PendulumParameters, 고정 gamma와 추정할 매개변수·초기 추정값.',
        'Base PendulumParameters, fixed gamma, parameter names to estimate and their initial guesses.'
      ]
    ],
    scope: { systemIds: ['system:double'], evolutions: ['ode'] },
    parameters: [
      'DoublePendulumFitSpec의 initialState, base, gamma, estimate, initialGuess, dt와 LevenbergMarquardtOptions; estimateInitialAngles는 초기 두 각도도 추정하지만 초기 각속도는 고정합니다.',
      'DoublePendulumFitSpec initialState, base, gamma, estimate, initialGuess, dt and LevenbergMarquardtOptions; estimateInitialAngles also fits the two initial angles while keeping initial angular velocities fixed.'
    ],
    output: [
      'parameter-fit',
      '적합 매개변수, 잔차와 기존 불확실성 진단.',
      'Fitted parameters, residuals and existing uncertainty diagnostics.'
    ],
    cost: [
      '최적화 반복과 Jacobian 평가마다 이중 진자 관측 궤도를 적분합니다.',
      'Integrates observation trajectories for optimization iterations and Jacobian evaluations.'
    ],
    limitation: [
      '점질량 이중 진자 관측 규약에 한정하며 다른 시스템의 추정기로 자동 확장되지 않습니다.',
      'Restricted to the point-mass double-pendulum observation contract; not automatically an estimator for other systems.'
    ]
  }),
  analysis({
    id: 'analysis:sobol',
    name: ['Sobol 분산 민감도', 'Sobol variance sensitivity'],
    module: 'src/research/sobolSensitivity.ts',
    exports: ['sobolIndices'],
    stage: 22,
    description: [
      '상자 범위의 모델 평가로 1차·총효과 분산 민감도를 추정합니다.',
      'Estimate first-order and total-effect variance sensitivities by evaluating a model over box ranges.'
    ],
    inputs: [
      [
        'model-evaluator',
        '유한 스칼라 또는 Promise를 반환하는 evaluate(point).',
        'evaluate(point) returning a scalar or Promise.'
      ],
      [
        'parameters',
        '이름과 min/max를 가진 SobolVariable 목록.',
        'SobolVariable entries with names and min/max bounds.'
      ]
    ],
    parameters: [
      'SobolIndicesOptions의 samples와 onProgress; 평가 함수는 순차 await됩니다.',
      'SobolIndicesOptions samples and onProgress; evaluations are awaited sequentially.'
    ],
    output: [
      'sobol-indices',
      '1차·총효과 지수, 평균·분산 및 비유한 출력 개수.',
      'First-order/total indices, mean/variance and non-finite output count.'
    ],
    cost: [
      'd개 변수와 N개 기저 표본에 대해 N(d+2)회 모델 평가.',
      'N(d+2) model evaluations for d variables and N base samples.'
    ],
    limitation: [
      '현재 방향수 표는 최대 6개 변수를 지원하며 추정 잡음과 비유한 평가가 해석에 영향을 줍니다.',
      'The current direction-number table supports at most six variables; estimator noise and non-finite evaluations affect interpretation.'
    ]
  }),
  analysis({
    id: 'analysis:pce-surrogate',
    name: ['다항 혼돈 대리모델', 'Polynomial chaos surrogate'],
    module: 'src/research/surrogate.ts',
    exports: ['fitPolynomialChaos'],
    stage: 22,
    description: [
      '표본 입출력에 Legendre 다항 기저를 적합해 대리모델을 만듭니다.',
      'Fit a Legendre polynomial basis to sampled inputs and outputs to build a surrogate.'
    ],
    inputs: [
      [
        'training-data',
        '물리 좌표 inputs와 스칼라 output을 가진 PolynomialChaosSample 목록.',
        'PolynomialChaosSample entries with physical-coordinate inputs and scalar output.'
      ]
    ],
    parameters: [
      'SurrogateVariable의 범위와 PolynomialChaosOptions의 총 다항 차수 degree.',
      'SurrogateVariable ranges and total polynomial degree from PolynomialChaosOptions.'
    ],
    output: [
      'polynomial-chaos-model',
      '계수·예측 함수, 평균·분산, Sobol 지수와 조건수 진단.',
      'Coefficients/predictor, mean/variance, Sobol indices and condition estimate.'
    ],
    cost: [
      '차원·차수에 따라 조합적으로 늘어나는 기저의 회귀 선형계.',
      'Regression solve for a basis growing combinatorially with dimension and degree.'
    ],
    limitation: [
      '독립 균등 입력 분포 가정이며 표본 수가 기저 항 수보다 적으면 거부됩니다.',
      'Assumes independent uniform inputs; fewer samples than basis terms are rejected.'
    ]
  }),
  analysis({
    id: 'analysis:sindy',
    name: ['SINDy 희소 동역학 식별', 'SINDy sparse dynamics identification'],
    module: 'src/research/sindy.ts',
    exports: ['identifyDynamics'],
    stage: 23,
    description: [
      '상태와 시간 미분에 희소 기저 회귀를 적용해 동역학을 식별합니다.',
      'Identify dynamics by sparse library regression on states and time derivatives.'
    ],
    inputs: [
      [
        'training-data',
        '표본 수가 같은 직사각형 states와 derivatives 배열.',
        'Rectangular states and derivatives arrays with equal sample counts.'
      ]
    ],
    parameters: [
      'SindyLibrarySpec와 SindyOptions의 threshold 및 회귀 설정.',
      'SindyLibrarySpec and SindyOptions threshold/regression settings.'
    ],
    output: [
      'sindy-model',
      '기저 항, 희소 계수와 적합 진단.',
      'Library terms, sparse coefficients and fit diagnostics.'
    ],
    cost: [
      '기저 차원, 표본 수와 임계 회귀 반복에 따라 증가합니다.',
      'Increases with library dimension, sample count and thresholded-regression iterations.'
    ],
    limitation: [
      '미분 추정 잡음과 기저 선택에 민감하며 식별된 방정식이 참 모델임을 보장하지 않습니다.',
      'Sensitive to derivative noise and library choice; identified equations are not guaranteed to be the true model.'
    ]
  }),
  analysis({
    id: 'analysis:dmd',
    name: ['동적 모드 분해', 'Dynamic mode decomposition'],
    module: 'src/research/dmd.ts',
    exports: ['dynamicModeDecomposition'],
    stage: 23,
    description: [
      '등간격 상태 스냅샷에서 선형 한 단계 연산자를 적합합니다.',
      'Fit a linear one-step operator from equally spaced state snapshots.'
    ],
    inputs: [
      ['trajectory', '동일 차원의 연속 스냅샷 2개 이상.', 'At least two consecutive snapshots of equal dimension.'],
      [
        'uniform-series',
        '모든 스냅샷에 공통인 양의 시간 간격 dt.',
        'Common positive time interval dt for all snapshots.'
      ]
    ],
    parameters: [
      'dynamicModeDecomposition(snapshots, dt, {ridge?, rank?}); rank는 SVD 절단.',
      'dynamicModeDecomposition(snapshots, dt, {ridge?, rank?}); rank selects SVD truncation.'
    ],
    output: [
      'dmd-model',
      '연산자, 이산·연속 고유값, 성장률·주파수와 한 단계 오차.',
      'Operator, discrete/continuous eigenvalues, growth rates/frequencies and one-step error.'
    ],
    cost: [
      '스냅샷 회귀, 선택적 SVD와 축소 연산자의 고유값 분해.',
      'Snapshot regression, optional SVD and eigenanalysis of the reduced operator.'
    ],
    limitation: [
      '관측 자료에 대한 선형 근사이며 훈련 오차는 장기 예측이나 정확한 Koopman 스펙트럼을 보장하지 않습니다.',
      'A linear data approximation; training error does not guarantee long-term prediction or an exact Koopman spectrum.'
    ]
  }),
  analysis({
    id: 'analysis:havok',
    name: ['HAVOK 임베딩', 'HAVOK embedding'],
    module: 'src/research/havok.ts',
    exports: ['havokAnalysis'],
    stage: 23,
    description: [
      '지연 Hankel 행렬의 저차원 좌표에서 선형 동역학과 강제 항을 추출합니다.',
      'Extract linear dynamics and forcing from reduced coordinates of a delay Hankel matrix.'
    ],
    inputs: [['uniform-series', '균일 스칼라 시계열과 양의 dt.', 'Uniform scalar time series with positive dt.']],
    parameters: [
      'havokAnalysis(series, dt, {delays, rank}); rank는 2 이상.',
      'havokAnalysis(series, dt, {delays, rank}); rank is at least two.'
    ],
    output: [
      'havok-model',
      '임베딩 좌표, 선형 계수와 강제 시계열.',
      'Embedding coordinates, linear coefficients and forcing series.'
    ],
    cost: [
      '지연×표본 Hankel 행렬의 SVD와 축소 회귀.',
      'SVD of a delay-by-sample Hankel matrix and reduced regression.'
    ],
    limitation: [
      '자료 길이·유효 rank가 충분해야 하며 추출 강제 항은 실제 외력 측정과 동일하지 않습니다.',
      'Requires sufficient data length and effective rank; extracted forcing is not necessarily a measured physical force.'
    ]
  }),
  analysis({
    id: 'analysis:reservoir',
    name: ['리저버 모델 학습', 'Reservoir model learning'],
    module: 'src/research/reservoir.ts',
    exports: ['trainEsn'],
    stage: 23,
    description: [
      '시드로 고정된 echo state network의 선형 출력층을 적합합니다.',
      'Fit the linear readout of a seeded fixed echo state network.'
    ],
    inputs: [
      [
        'training-data',
        '차원과 길이가 같은 입력·목표 시계열.',
        'Input and target series of matching dimension and length.'
      ]
    ],
    parameters: [
      'EsnSpec의 reservoirSize, dimension, spectralRadius, washout, ridge, seed 등.',
      'EsnSpec reservoirSize, dimension, spectralRadius, washout, ridge, seed and related settings.'
    ],
    output: [
      'trained-esn',
      '고정 리저버, 입력·출력 가중치와 학습 진단.',
      'Fixed reservoir, input/readout weights and training diagnostics.'
    ],
    cost: [
      '리저버 크기의 조밀 스펙트럼·회귀와 시계열 처리.',
      'Dense spectral/regression operations in reservoir size and time-series processing.'
    ],
    limitation: [
      '단일 leaky ESN이며 장기 혼돈 궤도 정확도와 일반화 성능은 별도 검증이 필요합니다.',
      'A single leaky ESN; long-term chaotic accuracy and generalization need separate validation.'
    ]
  }),
  analysis({
    id: 'analysis:hamiltonian-learning',
    name: ['해밀토니언 학습', 'Hamiltonian learning'],
    module: 'src/research/hamiltonianLearning.ts',
    exports: ['learnHamiltonian'],
    stage: 23,
    description: [
      '정준 방정식의 잔차를 최소화하는 기저 해밀토니언을 적합합니다.',
      'Fit a library Hamiltonian by minimizing canonical-equation residuals.'
    ],
    inputs: [
      [
        'training-data',
        '같은 표본 수의 정준 q, p, qDot, pDot 배열.',
        'Canonical q, p, qDot and pDot arrays with equal sample counts.'
      ]
    ],
    parameters: [
      'HamiltonianLibrarySpec의 degreesOfFreedom, polynomialDegree, trigCoordinates와 ridge.',
      'HamiltonianLibrarySpec degreesOfFreedom, polynomialDegree, trigCoordinates and ridge.'
    ],
    output: [
      'learned-hamiltonian',
      '기저 항·계수와 정준 방정식 적합 잔차.',
      'Library terms/coefficients and canonical-equation fit residuals.'
    ],
    cost: [
      '기저 항 수에 따른 정규 방정식 구성과 조밀 회귀.',
      'Normal-equation assembly and dense regression in the number of library terms.'
    ],
    limitation: [
      'p는 각속도가 아닌 정준 운동량이어야 합니다. 상수 에너지 기준은 식별되지 않으며 수치 rollout의 정확 보존은 보장하지 않습니다.',
      'p must be canonical momentum, not angular velocity. Additive energy gauge is unidentifiable, and numerical rollouts are not guaranteed to conserve energy exactly.'
    ]
  }),
  analysis({
    id: 'analysis:arnoldi',
    name: ['Arnoldi Krylov 고유값', 'Arnoldi Krylov eigenanalysis'],
    module: 'src/research/arnoldi.ts',
    exports: ['restartedArnoldi'],
    stage: 23,
    description: [
      '행렬·벡터 곱으로 주어진 실수 연산자의 일부 고유쌍을 근사합니다.',
      'Approximate selected eigenpairs of a real operator supplied through matrix-vector products.'
    ],
    inputs: [
      [
        'linear-operator',
        'RealLinearOperator의 실수 벡터 apply 함수.',
        'Real-vector apply function following RealLinearOperator.'
      ]
    ],
    parameters: [
      'ArnoldiOptions의 dimension, numEigenvalues, krylovDim, maxRestarts, tolerance와 seed.',
      'ArnoldiOptions dimension, numEigenvalues, krylovDim, maxRestarts, tolerance and seed.'
    ],
    output: [
      'arnoldi-eigenpairs',
      '선택 Ritz 고유쌍, 잔차와 수렴 진단.',
      'Selected Ritz eigenpairs, residuals and convergence diagnostics.'
    ],
    cost: [
      '반복 행렬·벡터 곱, Krylov 기저 저장과 재직교화.',
      'Repeated matrix-vector products, Krylov basis storage and reorthogonalization.'
    ],
    limitation: [
      '실수 선형 연산자와 요청한 일부 스펙트럼을 대상으로 하며 반복 상한 내 수렴을 보장하지 않습니다.',
      'Targets a real linear operator and selected spectrum only; convergence within the iteration cap is not guaranteed.'
    ]
  }),
  analysis({
    id: 'analysis:lanczos',
    name: ['Lanczos Krylov 고유값', 'Lanczos Krylov eigenanalysis'],
    module: 'src/research/lanczos.ts',
    exports: ['restartedLanczos'],
    stage: 23,
    description: [
      '대칭 실수 연산자의 일부 극단 고유쌍을 재시작 Lanczos로 근사합니다.',
      'Approximate selected extremal eigenpairs of a real symmetric operator using restarted Lanczos.'
    ],
    inputs: [
      [
        'symmetric-operator',
        '대칭성이 확인된 SymmetricOperator의 apply 함수.',
        'SymmetricOperator apply function with verified symmetry.'
      ]
    ],
    parameters: [
      'LanczosOptions의 dimension, numEigenvalues, which, krylovDim, maxRestarts, tolerance와 seed.',
      'LanczosOptions dimension, numEigenvalues, which, krylovDim, maxRestarts, tolerance and seed.'
    ],
    output: [
      'lanczos-eigenpairs',
      '실수 Ritz 고유쌍, 잔차와 수렴 보고서.',
      'Real Ritz eigenpairs, residuals and convergence report.'
    ],
    cost: [
      '행렬·벡터 곱과 전체 재직교화, Krylov 기저 메모리.',
      'Matrix-vector products, full reorthogonalization and Krylov-basis memory.'
    ],
    limitation: [
      '비대칭·일반 복소 연산자를 지원한다고 가정하지 않으며 호출자가 대칭성 조건을 확인해야 합니다.',
      'Do not assume support for nonsymmetric or general complex operators; caller must verify symmetry.'
    ]
  }),
  analysis({
    id: 'analysis:general-eigensolver',
    name: ['일반 실수 행렬 고유값', 'General real-matrix eigenanalysis'],
    module: 'src/research/eigenGeneral.ts',
    exports: ['eigenvaluesGeneral'],
    stage: 23,
    description: [
      '실수 비대칭 정방 행렬의 복소 고유값을 계산합니다.',
      'Compute complex eigenvalues of a real nonsymmetric square matrix.'
    ],
    inputs: [
      ['matrix', '직사각형 행 목록으로 표현한 실수 정방 행렬.', 'Real square matrix represented as equal-length rows.']
    ],
    parameters: [
      'eigenvaluesGeneral(matrix, {balance?, maxIterationsPerRoot?}).',
      'eigenvaluesGeneral(matrix, {balance?, maxIterationsPerRoot?}).'
    ],
    output: ['complex-eigenvalues', '고유값의 실수·허수 성분 목록.', 'Real and imaginary parts of eigenvalues.'],
    cost: ['조밀 Hessenberg 축약과 반복 QR 비용.', 'Dense Hessenberg reduction and iterative QR cost.'],
    limitation: [
      '이 export는 실수 행렬에서 복소 고유값을 반환합니다. 복소 입력 행렬이나 고유벡터까지 제공하는 API로 오해하지 않습니다.',
      'This export returns complex eigenvalues from real matrices; it does not accept complex input matrices or return eigenvectors.'
    ]
  }),
  analysis({
    id: 'analysis:structure-validation',
    name: ['에너지 구조 보존 진단', 'Energy structure-preservation diagnostics'],
    module: 'src/research/structurePreservation.ts',
    exports: ['energyDriftProfile'],
    stage: 21,
    description: [
      '장시간 적분의 에너지 오차를 표본화해 세속 추세와 유계 변동을 비교합니다.',
      'Sample long-time integration energy error to compare secular trends and bounded variation.'
    ],
    inputs: [
      initialState,
      rhs,
      [
        'energy-function',
        '현재 좌표 상태에서 기계적 에너지를 반환하는 함수.',
        'Function returning mechanical energy from the current coordinate state.'
      ]
    ],
    scope: ode,
    parameters: [
      'EnergyDriftProfileOptions의 method, dt, totalTime, samples, tolerance.',
      'EnergyDriftProfileOptions method, dt, totalTime, samples and tolerance.'
    ],
    output: [
      'energy-drift-profile',
      '드리프트 시계열, 최대 오차, 추세 기울기·R²와 분류.',
      'Drift series, maximum error, trend slope/R-squared and classification.'
    ],
    cost: [
      '선택한 적분법의 장시간 실행과 에너지 표본 평가.',
      'Long-time execution of the selected integrator and sampled energy evaluations.'
    ],
    limitation: [
      '보존 에너지 가정과 좌표 규약이 필요하며 유계 드리프트만으로 정준 심플렉틱성이나 수렴 차수를 인증하지 않습니다.',
      'Requires a conserved-energy assumption and suitable coordinates; bounded drift alone does not certify canonical symplecticity or convergence order.'
    ]
  })
];
